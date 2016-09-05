 /* global SpotifyWebApi */
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
var totalSongSize = 0;

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

function getPeaks(data, samplingRate, partsPerSecond) {

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
    var partSize = Math.round(samplingRate / partsPerSecond),
        parts = data[0].length / partSize,
        peaks = [],
        peakPercentage = 0.7;
    var size = 0,
        totalSongSize = data[0].length,
        totalSongDuration = totalSongSize / samplingRate;

    for (var i = 0; i < parts; i++) {
        var max = 0;
        for (var j = i * partSize; j < (i + 1) * partSize; j++) {
            var volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
            if (max == 0 || ((volume > max.volume))) {
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

    peaks.forEach(function(peak, index) {
        //Compares the peak distance to the next 10 peaks
        for (var i = 1;
            (index + i) < peaks.length && i < 10; i++) {
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

function getSections(peaks, samplingRate, data){
    var totalSongDuration = data[0].length / samplingRate;
    console.log(totalSongDuration);
    var sumDistances = 0;
    var avgDistance;

    //Get the average of peak seperation
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
    var firstSection = new section(0, firstPeakDeviation, samplingRate);
    firstSection.peaks.push(peaks[0]);
    sections.push(firstSection);
    var sectionMargin = 2;

    //Split the song into sections
    peaks.forEach(function(peak, index) {
        var peakDeviation = (peak.distanceToNext - avgDistance) / stdDev;
        //If the peak is within a the same deviation as the current section, add it to section peaks array, otherwise create a new section
        if (Math.abs(sections[sections.length - 1].stdDev - peakDeviation) > sectionMargin && peak.distanceToNext != 0) {
            var newSection = new section(peak.position, peakDeviation, samplingRate);
            newSection.peaks.push(peak);
            sections.push(newSection);
        }else{
            sections[sections.length - 1].peaks.push(peak);
        }
    });

    //Calculate section length and duration
    sections.forEach(function(section, index){
        if(sections[index + 1]){
            section.sectionData = [data[0].slice(section.start, sections[index + 1].start), data[1].slice(section.start, sections[index + 1].start)];
            section.length = sections[index + 1].start - section.start
            section.duration = (sections[index + 1].start - section.start) / section.samplingRate;
        }else{
            section.sectionData = [data[0].slice(section.start), data[1].slice(section.start)]
            section.length =  section.start + section.sectionData[0].length;
            section.duration = (totalSongSize + section.sectionData[0].length) / section.samplingRate;
        }
    });

    var averageBPM = 0;
    var totalBPM = 0;
    var totalSectionDuration = 0;
    //Calculate Section BPM
    sections.forEach(function(section, index){
        var peaks = getPeaks(section.sectionData, section.samplingRate, 8);
        var groups = getIntervals(peaks, section.samplingRate);
        var top = groups.sort(function(intA, intB) {
            return intB.count - intA.count;
        });
        if(top[0]){
            section.bpm = top[0].tempo;
        }else{
            section.bpm = 100;
        }
        totalSectionDuration = totalSectionDuration + section.duration;
        totalBPM = totalBPM + Math.abs(section.bpm * section.duration);
        section.avgVolume = getAvgVolume(section.sectionData);
    });
    console.log(totalSectionDuration);
    averageBPM = totalBPM / totalSongDuration;
    console.log("Hello World!");
    console.log(totalBPM);
    console.log(totalSongDuration);
    console.log(averageBPM);




}

var getAvgVolume = function(data){
    var totalVolume = 0;
    var size = 0;
    var avgVolume;
    for (var i = 0; i < data[0].length; i++) {
        var volume = Math.max(Math.abs(data[0][i]), Math.abs(data[1][i]));
        if (volume != 0) {
            totalVolume = totalVolume + volume;
            size++;
        }
    }
    avgVolume = totalVolume / size;
    return avgVolume;

}

var getMusicData = function(musicArrayBuffer, songsize) {
    var musicDataView = new DataView(musicArrayBuffer);

    var mp3Tags = mp3Parser.readTags(musicDataView);
    console.log(mp3Tags);


    //Cutting out metadata, we shouldnt try to analyze this
    musicArrayBuffer = musicArrayBuffer.slice(mp3Tags[0]._section.byteLength);
    console.log(musicArrayBuffer);


    //The song sampling rate
    //TODO: Reimpliment this being dynamic

    //TODO: Impliment mp3-parser to get total frames, should be fun! ^_^
    //kill me
    var samplingRate =  44100;


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
        console.log(e.renderedBuffer.duration);
        var peaks = getPeaks([buffer.getChannelData(0), buffer.getChannelData(1)], samplingRate, 4);
        var groups = getIntervals(peaks, samplingRate, [buffer.getChannelData(0), buffer.getChannelData(1)]);
        getSections(peaks, samplingRate, [buffer.getChannelData(0), buffer.getChannelData(1)]);
        var svg = document.querySelector('#svg');
        svg.innerHTML = '';
        var svgNS = 'http://www.w3.org/2000/svg';
        var rect;
        //Draw the peaks
        sections.forEach(function(section, index) {
            rect = document.createElementNS(svgNS, 'rect');
            rect.setAttributeNS(null, 'x', (100 * section.start / buffer.length) + '%');
            rect.setAttributeNS(null, 'y', 0);
            rect.setAttributeNS(null, 'sectionIndex', index);
            console.log(sections[rect.getAttribute("sectionIndex")]);
            rect.setAttributeNS(null, 'fill', section.color);
            rect.addEventListener("click", function(){
                console.log(sections[rect.getAttribute("sectionIndex")].tempo);
            })
            if (section[index + 1]) {
                rect.setAttributeNS(null, 'width', ((sections[index + 1].start - section.start)));
            } else {
                rect.setAttributeNS(null, 'width', (buffer.length - section.start));
            }
            rect.setAttributeNS(null, 'height', '100%');
            svg.appendChild(rect);
        });

        //Draw the peaks
        /*
        peaks.forEach(function(peak) {
            rect = document.createElementNS(svgNS, 'rect');
            rect.setAttributeNS(null, 'x', (100 * peak.position / buffer.length) + '%');
            rect.setAttributeNS(null, 'y', 0);
            rect.setAttributeNS(null, 'width', 1);
            rect.setAttributeNS(null, 'height', '100%');
            svg.appendChild(rect);
        });
        */

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
    console.log(musicFile);

    //Put the user file into the <audio> tag for playback
    var dataUrlReader = new FileReader();
    dataUrlReader.onload = function() {
        audioTag.src = dataUrlReader.result;
    }
    dataUrlReader.readAsDataURL(musicFile);

    //Read the user file into a format that can we can work with, an array buffer
    var arrayBufferReader = new FileReader();
    arrayBufferReader.onload = function() {
        var musicArrayBuffer = arrayBufferReader.result;
        var musicDataView = new DataView(musicArrayBuffer);

        var frameCount = 0;
        var tagIndex = 0;
        var sampleCount = 0;

        //MARCHETTI - ORIGINAL FORMULA, TAKE NOTES!!!!!! ^_^
        var frameType = mp3Parser.readTags(musicDataView)[0]._section.type;

        //Skips any frames at the start that dont contain music data
        var frameType = mp3Parser.readTags(musicDataView)[0]._section.type;
        while(frameType != "frame"){
            tagIndex++;
            frameType = mp3Parser.readTags(musicDataView)[tagIndex]._section.type
        }

        var mp3tags = mp3Parser.readTags(musicDataView)[tagIndex];
        while (true) {
            frameCount++;
            if(mp3tags._section.type === 'frame'){
                sampleCount = sampleCount + mp3tags._section.sampleLength;
            }else{
                //If it doesnt contain music data? TRASH IT!
                musicArrayBuffer.splice(mp3tags._section.nextFrameIndex - mp3tags._section.sampleLength, mp3tags_section.nextFrameIndex);
            }
            mp3tags = mp3Parser.readFrame(musicDataView, mp3tags._section.nextFrameIndex);
            if (mp3tags == null) {
                break;
            }
        }

        getMusicData(musicArrayBuffer, sampleCount);
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

var section = function(start, stdDev, samplingRate) {
    this.start = start;
    this.samplingRate = samplingRate;
    

    this.stdDev = stdDev;

    this.peaks = [];

    this.color = randomColor();

    //TODO: Add BPM Calculation
    this.calculateBPM = function(){
        this.peaks.forEach(function(){

        })
    }
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
