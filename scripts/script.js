﻿ /* global SpotifyWebApi */
/*
  The code for finding out the BPM / tempo is taken from this post:
  http://tech.beatport.com/2014/web-audio/beat-detection-using-web-audio/
 */

/* TODO List
 * 1. Remove metadata from songs before analyzing
 * 2. Improve Visualization
 * 3. Add BPM for each section
 * 4. Clean Up Code
 */
'use strict';


var queryInput = document.querySelector('#query'),
    result = document.querySelector('#result'),
    text = document.querySelector('#text'),
    audioTag = document.querySelector('#audio'),
    playButton = document.querySelector('#play'),
    audioPreview = document.getElementById('musicPreview');
var sections = [];

function updateProgressState() {
    if (audioTag.paused) {
        return;
    }
    var progressIndicator = document.querySelector('#progress');
    if (progressIndicator && audioTag.duration) {
        progressIndicator.setAttribute('x', (audioTag.currentTime * 100 / audioTag.duration) + '%');
    }
    requestAnimationFrame(updateProgressState);
}
audioTag.addEventListener('play', updateProgressState);
audioTag.addEventListener('playing', updateProgressState);

function updatePlayLabel() {
    playButton.innerHTML = audioTag.paused ? 'Play track' : 'Pause track';
}

audioTag.addEventListener('play', updatePlayLabel);
audioTag.addEventListener('playing', updatePlayLabel);
audioTag.addEventListener('pause', updatePlayLabel);
audioTag.addEventListener('ended', updatePlayLabel);

playButton.addEventListener('click', function() {
    if (audioTag.paused) {
        audioTag.play();
    } else {
        audioTag.pause();
    }
});

result.style.display = 'none';

function getPeaks(data, samplingRate) {

    // What we're going to do here, is to divide up our audio into parts.

    // We will then identify, for each part, what the loudest sample is in that
    // part.

    // It's implied that that sample would represent the most likely 'beat'
    // within that part.

    // Each part is 0.5 seconds long - or 22,050 samples.

    // This will give us 60 'beats' - we will only take the loudest half of
    // those.

    // This will allow us to ignore breaks, and allow us to address tracks with
    // a BPM below 120.

    //Peak percentage is the percent of the peaks that will be taken into account, between 0 and 1

    //Right now it just looks at the highest volumes in 0.5 second intervals and takes a certain percentage of those, maybe compare to average volume?

    //or pErHAPS!!! ...
    //Improved Peak Alogrithm:
    /*
    1. Use original method to identify peaks
    2.  identify the areas where the peaks are closer together
    3. split the song into sections and take the average of each section
    4. use that average to calculate the record where the beats take place
    */

    //Half-Second Parts
    var partSize = Math.round(samplingRate / 4),
        parts = data[0].length / partSize,
        peaks = [],
        peakPercentage = 0.7;
    var totalVolume = 0,
        avgVolume = 0;
    var size = 0;
    for (var i = 0; i < data[0].length; i++) {
        var volume = Math.max(Math.abs(data[0][i]), Math.abs(data[1][i]));
        if (volume != 0) {
            totalVolume = totalVolume + volume;
            size++;
        }
    }
    avgVolume = totalVolume / size;


    for (var i = 0; i < parts; i++) {
        var max = 0;
        for (var j = i * partSize; j < (i + 1) * partSize; j++) {
            var volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
            if (max == 0 || ((volume > max.volume) && volume > avgVolume)) {
                max = {
                    position: j,
                    volume: volume
                };
            }
        }
        peaks.push(max);
    }

    // We then sort the peaks according to volume...

    peaks.sort(function(a, b) {
        return b.volume - a.volume;
    });

    // ...take the loundest half of those...
    //Modify the

    peaks = peaks.splice(0, peaks.length * peakPercentage);

    // ...and re-sort it back based on position.

    peaks.sort(function(a, b) {
        return a.position - b.position;
    });

    //kCluster(3, peaks);
    return peaks;
}

function getIntervals(peaks, samplingRate) {

    // What we now do is get all of our peaks, and then measure the distance to
    // other peaks, to create intervals.  Then based on the distance between
    // those peaks (the distance of the intervals) we can calculate the BPM of
    // that particular interval.

    // The interval that is seen the most should have the BPM that corresponds
    // to the track itself.

    var groups = [];
    var sumDistances = 0;
    var avgDistance;

    var chartData = [];
    for (var i = 0; i < peaks.length; i++) {
        var positionInSeconds = peaks[i].position / samplingRate;
        var distanceToNextInSeconds = peaks[i].distanceToNext / samplingRate;
        peaks[i].positionInSeconds = positionInSeconds;
        chartData.push({
            x: positionInSeconds,
            y: distanceToNextInSeconds
        })
    }


    peaks.forEach(function(peak, index) {
        if (peaks[index + 1] && peaks[index - 1]) {
            peak.distanceToNext = peaks[index + 1].position - peak.position
            peak.distanceToLast = peak.position - peaks[index - 1].position;
            peak.distanceBetween = peak.distanceToNext - peak.distanceToLast
        } else {
            peak.distanceToNext = 0;
        }
        sumDistances = sumDistances + peak.distanceToNext;
    });


    avgDistance = sumDistances / peaks.length;
    var stdDev = getStandardDev(peaks, avgDistance);

    var firstPeakDeviation = (peaks[0].position - avgDistance) / stdDev;
    var firstSection = new section(0, firstPeakDeviation);
    sections.push(firstSection);
    var sectionMargin = 2;


    peaks.forEach(function(peak, index) {
        var peakDeviation = (peak.distanceToNext - avgDistance) / stdDev;

        if (Math.abs(sections[sections.length - 1].stdDev - peakDeviation) > sectionMargin && peak.distanceToNext != 0) {
            sections.push(new section(peak.position, peakDeviation));
        }
    });
    console.log(sections);


    console.log(getStandardDev(peaks, avgDistance));
    console.log(avgDistance);
    console.log(avgDistance / samplingRate);

    //Draw the data to chart
    var ctx = document.getElementById("myChart");

    /*
    var scatterChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Scatter Dataset',
                data: chartData
            }]
        },
        options: {
            scales: {
                xAxes: [{
                    type: 'linear',
                    position: 'bottom'
                }]
            }
        }
    });
    */

    peaks.forEach(function(peak, index) {
        //Compares the peak distance to the next 10 peaks
        for (var i = 1;
            (index + i) < peaks.length && i < 20; i++) {
            var peakDistance = peaks[index + i].position - peak.position;
            var group = {
                //This tempo calculation is WRONG
                //Fix it later maybe
                //probs not tbh
                tempo: (60 * samplingRate) / (peaks[index + i].position - peak.position),
                count: 1
            };

            //Keep itwith 90-180 BPM range
            while (group.tempo < 90) {
                group.tempo *= 2;
            }

            while (group.tempo > 180) {
                group.tempo /= 2;
            }

            //Turn tempo into an integer
            group.tempo = Math.round(group.tempo);

            //If thhis BPM has been recorded, add to group
            //Otherwise, push the group to be recorded
            if (!(groups.some(function(interval) {
                    return (interval.tempo === group.tempo ? interval.count++ : 0);
                }))) {
                groups.push(group);
            }
        }
    });
    return groups;
}

var getMusicData = function(musicArrayBuffer, songsize) {

    var musicDataView = new DataView(musicArrayBuffer);
    console.log(musicDataView);


    var mp3Tags = mp3Parser.readTags(musicDataView);

    musicArrayBuffer.slice(mp3Tags[0]._section.byteLength);
    var nextFrame = mp3Parser.readFrame(musicDataView, mp3Tags[1]._section.nextFrameIndex);
    while (nextFrame) {
        if (nextFrame._section.type != "frame") {
            console.log("There is something that iSnt a frame!");
            console.log(nextFrame._section.type);
        }
        nextFrame = mp3Parser.readFrame(musicDataView, nextFrame._section.nextFrameIndex);
    }
    console.log("Done looking for not frames");


    //The song sampling rate
    var samplingRate = mp3Tags[1].header.samplingRate;
    console.log(samplingRate);

    console.log(mp3Tags);

    // Create offline context
    //http://stackoverflow.com/questions/5140085/how-to-get-sampling-rate-and-frequency-of-music-file-mp3-in-android
    //also look into getting the length of each song
    var OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var offlineContext = new OfflineContext(2, songsize, samplingRate);

    offlineContext.decodeAudioData(musicArrayBuffer, function(buffer) {

        // Create buffer source
        var source = offlineContext.createBufferSource();
        source.buffer = buffer;

        // Beats, or kicks, generally occur around the 100 to 150 hz range.
        // Below this is often the bassline.  So let's focus just on that.

        // First a lowpass to remove most of the song.

        var lowpass = offlineContext.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 150;
        lowpass.Q.value = 1;

        // Run the output of the source through the low pass.

        source.connect(lowpass);

        // Now a highpass to remove the bassline.

        var highpass = offlineContext.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 100;
        highpass.Q.value = 1;

        // Run the output of the lowpass through the highpass.

        lowpass.connect(highpass);

        // Run the output of the highpass through our offline context.

        highpass.connect(offlineContext.destination);

        // Start the source, and render the output into the offline conext.

        source.start(0);
        offlineContext.startRendering();
    });

    offlineContext.oncomplete = function(e) {
        var buffer = e.renderedBuffer;
        var peaks = getPeaks([buffer.getChannelData(0), buffer.getChannelData(1)], samplingRate);
        var groups = getIntervals(peaks, samplingRate);

        var svg = document.querySelector('#svg');
        svg.innerHTML = '';
        var svgNS = 'http://www.w3.org/2000/svg';
        var rect;
        //Draw the peaks
        sections.forEach(function(section, index) {
            rect = document.createElementNS(svgNS, 'rect');
            rect.setAttributeNS(null, 'x', (100 * section.start / buffer.length) + '%');
            rect.setAttributeNS(null, 'y', 0);
            rect.setAttributeNS(null, 'fill', section.color);
            if (section[index + 1]) {
                rect.setAttributeNS(null, 'width', ((sections[index + 1].start - section.start)));
            } else {
                rect.setAttributeNS(null, 'width', (buffer.length - section.start));
            }
            rect.setAttributeNS(null, 'height', '100%');
            svg.appendChild(rect);
        });
        //Draw the peaks

        peaks.forEach(function(peak) {
            rect = document.createElementNS(svgNS, 'rect');
            rect.setAttributeNS(null, 'x', (100 * peak.position / buffer.length) + '%');
            rect.setAttributeNS(null, 'y', 0);
            rect.setAttributeNS(null, 'width', 1);
            rect.setAttributeNS(null, 'height', '100%');
            svg.appendChild(rect);
        });


        rect = document.createElementNS(svgNS, 'rect');
        rect.setAttributeNS(null, 'id', 'progress');
        rect.setAttributeNS(null, 'y', 0);
        rect.setAttributeNS(null, 'width', 1);
        rect.setAttributeNS(null, 'height', '100%');
        svg.appendChild(rect);

        svg.innerHTML = svg.innerHTML; // force repaint in some browsers

        var top = groups.sort(function(intA, intB) {
            return intB.count - intA.count;
        }).splice(0, 5);

        text.innerHTML = '<div id="guess">Guess for track <strong>' + "Unknown Song" + '</strong> by ' +
            '<strong>' + "Unknown Artist" + '</strong> is <strong>' + Math.round(top[0].tempo) + ' BPM</strong>' +
            ' with ' + top[0].count + ' samples.</div>';

        text.innerHTML += '<div class="small">Other options are ' +
            top.slice(1).map(function(group) {
                return group.tempo + ' BPM (' + group.count + ')';
            }).join(', ') +
            '</div>';

        var printENBPM = function(tempo) {
            text.innerHTML += '<div class="small">The tempo according to Spotify is ' +
                tempo + ' BPM</div>';
        };

        result.style.display = 'block';
    };
};




var fileUpload = document.getElementById("drop_zone");

var uploadFunction = function() {

    var musicFile = fileUpload.files[0];
    //TODO: Prevent ppl from fucking up by uploading other types of files

    //Put the user file into the <audio> tag for playback
    var dataUrlReader = new FileReader();
    dataUrlReader.onload = function() {
        audioTag.src = dataUrlReader.result;
    }
    dataUrlReader.readAsDataURL(musicFile);

    //Read the user file into a format that can we can work with, an array buffer
    var arrayBufferReader = new FileReader();

    arrayBufferReader.onload = function() {
        getMusicData(arrayBufferReader.result, arrayBufferReader.result.byteLength);
    }

    arrayBufferReader.readAsArrayBuffer(musicFile);

    /*
    fs.readFile(musicFile.path, function (err, data) {
        if (err) {
            console.log("There was an error")
            console.log(err)
        } else {
            console.log(data)
            var musicView = new DataView(data.buffer);
            console.log(musicView);

            var mp3tags = mp3parser.readTags(musicView)[1];
            while (true) {
                var songSize = mp3tags._section.nextFrameIndex;
                mp3tags = mp3parser.readFrame(musicView, mp3tags._section.nextFrameIndex);
                if (mp3tags == null) {
                    break;
                };
            }
            console.log(songSize);

            console.log(mp3tags);

        }


    });
    */

}




function getStandardDev(data, dataAvg) {
    var summation = 0;
    if (dataAvg) {
        data.forEach(function(item, index) {
            summation = summation + ((item.distanceToNext - dataAvg) * (item.distanceToNext - dataAvg))
        });
    }
    return Math.sqrt(summation / data.length);


}

var section = function(start, stdDev) {
    this.start = start;
    this.stdDev = stdDev;
    this.color = getRandomColor();
}



function getRandomColor() {
    var randNumber = Math.floor(Math.random() * 10);

    switch (randNumber) {
        case 0:
            return 'pink';
        case 1:
            return 'orange';
        case 2:
            return 'gray';
        case 3:
            return 'white';
        case 4:
            return 'blue';
        case 5:
            return 'maroon';
        case 6:
            return 'aqua';
        case 7:
            return 'purple';
        case 8:
            return 'navy';
        case 9:
            return 'fuchsia';
        default:
            return 'green';
    }

}
