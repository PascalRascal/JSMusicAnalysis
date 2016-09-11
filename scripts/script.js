/* global SpotifyWebApi */
/*
  The code for finding out the BPM / tempo is taken from this post:
  http://tech.beatport.com/2014/web-audio/beat-detection-using-web-audio/
 */

/* TODO List
 * 1. Improve Visualization
 * 2. Ability to adjust algorithm options in the browser
 * 3. Improve Performance or at least add a loading bar or something
 */


var queryInput = document.querySelector('#query'),
    result = document.querySelector('#result'),
    text = document.querySelector('#text'),
    audioTag = document.querySelector('#audio'),
    playButton = document.querySelector('#play'),
    audioPreview = document.getElementById('musicPreview');
var totalSongSize = 0;
var renderedBuffer;
var originalSongBuffer;
//Keep track of URLs created so we can delete them later if necessary
var sectionURLs = [];

function updateProgressState() {
    if (audioTag.paused) {
        return;
    }
    var progressIndicator = document.querySelector('#progress');
    if (progressIndicator && audioTag.duration) {
        document.getElementById("durationTracker").innerHTML = Math.floor(audioTag.currentTime) + " / " + audioTag.duration;
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

playButton.addEventListener('click', function () {
    if (audioTag.paused) {
        audioTag.play();
    } else {
        audioTag.pause();
    }
});

result.style.display = 'none';

//Trims the data and removes any irrelevant meta-data, also gets the sampling rate about the song
function handleArrayBuffer(musicArrayBuffer) {
    var musicDataView = new DataView(musicArrayBuffer);

    var frameCount = 0;
    var tagIndex = 0;
    var sampleCount = 0;

    var frameType = mp3Parser.readTags(musicDataView)[0]._section.type;

    //Skips any frames at the start that dont contain music data
    var frameType = mp3Parser.readTags(musicDataView)[0]._section.type;
    while (frameType != "frame") {
        tagIndex++;
        frameType = mp3Parser.readTags(musicDataView)[tagIndex]._section.type
    }
    console.log(mp3Parser.readTags(musicDataView)[tagIndex])
    var samplingRate = mp3Parser.readTags(musicDataView)[tagIndex].header.samplingRate

    var mp3tags = mp3Parser.readTags(musicDataView)[tagIndex];
    while (true) {
        if (mp3tags._section.type === 'frame') {
            frameCount++;
            sampleCount = sampleCount + mp3tags._section.sampleLength;
        } else {
            //If it doesnt contain music data? TRASH IT!
            musicArrayBuffer.splice(mp3tags._section.nextFrameIndex - mp3tags._section.sampleLength, mp3tags_section.nextFrameIndex);
        }
        mp3tags = mp3Parser.readFrame(musicDataView, mp3tags._section.nextFrameIndex);
        if (mp3tags == null) {
            break;
        }
    }
    originalSongBuffer = musicArrayBuffer
    //Put the data into the audiotag
    var songBlob = new Blob([musicArrayBuffer], { type: "audio/mpeg3" });
    audioTag.src = window.URL.createObjectURL(songBlob);

    getMusicData(musicArrayBuffer, sampleCount, samplingRate);
}

//Loads the trimmed audio-data and filters it appropiately before analyzing it
var getMusicData = function (musicArrayBuffer, songsize, samplingRate) {
    var musicDataView = new DataView(musicArrayBuffer);



    //The song sampling rate
    //TODO: Reimpliment this being dynamic

    //TODO: Impliment mp3-parser to get total frames, should be fun! ^_^
    //kill me
    var samplingRate = 44100;


    // Create offline context
    var OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var offlineContext = new OfflineContext(2, songsize, samplingRate);

    offlineContext.decodeAudioData(musicArrayBuffer, function (buffer) {

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

    offlineContext.oncomplete = function (e) {
        var userPPS = document.getElementById("userPPS").value;
        var userSectionMargin = document.getElementById("userSectionMargin").value;
        console.log(userPPS);

        var analysisOptions = { partsPerSecond: userPPS, sectionMargin: userSectionMargin };

        var renderedBuffer = e.renderedBuffer;
        console.log([renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)]);
        analyzeSong([renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)], samplingRate, analysisOptions, drawData);
    };
};


//Analyzes the song data, calls cb when done
function analyzeSong(songData, samplingRate, songOptions, cb) {
    var pps;
    var sm;
    if (songOptions.peaksPerSecond) {
        pps = peaksPerSecond;
    } else {
        pps = 2;
    }
    if (songOptions.sectionMargin) {
        sm = songOptions.sectionMargin
    } else {
        sm = 1.5;
    }
    console.log(sm);

    var worker = new Worker(URL.createObjectURL(new Blob(["(" + worker_function.toString() + ")()"], { type: 'text/javascript' })));

    var workerPeaks;
    var workerSongData;

    worker.addEventListener('message', function (e) {
        var data = e.data;
        if (data.returnType == "peaks") {
            workerPeaks = data.peaks;
            console.log(workerPeaks);
            workerSongData = data.songData
            getWorkerSections(workerSongData, workerPeaks, data.samplingRate, sm);
        } else if (data.returnType == "sections") {
            var sections = data.sections;
            cb(workerPeaks, sections, workerSongData);
        }
    }, false);

    function getWorkerPeaks(songData, samplingRate, peaksPerSecond) {
        worker.postMessage({ 'cmd': 'getPeaks', 'songData': songData, 'samplingRate': samplingRate, 'peaksPerSecond': peaksPerSecond });
    }

    function getWorkerIntervals(peaks, samplingRate, sm) {
        worker.postMesssage({ 'cmd': 'getIntervals', 'peaks': peaks, 'samplingRate': samplingRate, 'sectionMargin': sm });
    }

    function getWorkerSections(songData, peaks, samplingRate) {
        worker.postMessage({ 'cmd': 'getSections', 'peaks': peaks, 'samplingRate': samplingRate, 'songData': songData, 'sectionMargin': sm });
    }

    getWorkerPeaks(songData, samplingRate, pps);


}
//Draws the sections and peaks
function drawData(peaks, sections, buffer) {
    var svg = document.querySelector('#svg');
    svg.innerHTML = '';
    var svgNS = 'http://www.w3.org/2000/svg';
    var rect;
    document.getElementById("sectionAnalysis").innerHTML = '';


    sections.forEach(function (section, index) {
        rect = document.createElementNS(svgNS, 'rect');

        rect.setAttributeNS(null, 'x', (100 * section.start / buffer[0].length) + '%');
        rect.setAttributeNS(null, 'y', 0);
        rect.setAttributeNS(null, 'sectionIndex', index);
        console.log(sections[rect.getAttribute("sectionIndex")]);
        rect.setAttributeNS(null, 'fill', section.color);
        if (section[index + 1]) {
            rect.setAttributeNS(null, 'width', (100 * ((sections[index + 1].start - section.start) / buffer[0].length)) + `%`);
        } else {
            rect.setAttributeNS(null, 'width', (100 * ((buffer[0].length - section.start) / buffer[0].length)) + '%');
        }
        rect.setAttributeNS(null, 'height', '100%');
        svg.appendChild(rect);
        drawSection(section, index);
    });

    //Draw the peaks
    console.log(peaks);
    
    peaks.forEach(function(peak) {
        rect = document.createElementNS(svgNS, 'rect');
        rect.setAttributeNS(null, 'x', (100 * peak.position / buffer[0].length) + '%');
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

    var totalbeats = 0;
    var totalDuration = 0;
    sections.forEach(function (section) {
        totalbeats = totalbeats + section.bpm * section.duration / 60;
        totalDuration = totalDuration + section.duration;
    });

    var avgBPM = totalbeats * 60 / totalDuration;

    text.innerHTML = "The average BPM for this song is " + Math.round(avgBPM) + " beats per minute";
    console.log(totalDuration);


    result.style.display = 'block';
};
//Displays information about a particular section
function drawSection(section, index) {
    sectionDiv = document.createElement("div");
    sectionDiv.addEventListener("click", function () {
        var progressIndicator = document.querySelector('#progress');
        audioTag.currentTime = section.start / section.samplingRate;
        progressIndicator.setAttribute('x', (audioTag.currentTime * 100 / audioTag.duration) + '%');
        console.log(section);
    })
    sectionDiv.className = "songSection";
    sectionDiv.innerHTML = `
        <h3> Section ` + index + `</h3>
        <br>
        <b>BPM: ` + section.bpm + `</b> <br>
        <b>Peaks: ` + section.peaks.length + `</b> <br>
        <b>Duration: ` + section.duration + `</b> <br>
        <b>Start: ` + section.start / section.samplingRate + `</b> <br>
    `
    sectionDiv.style.backgroundColor = section.color;
    document.getElementById("sectionAnalysis").appendChild(sectionDiv);
}


//Loads and analyzes user file
var fileUpload = document.getElementById("drop_zone");
var uploadFunction = function () {

    var musicFile = fileUpload.files[0];
    console.log(musicFile);

    //Read the user file into a format that can we can work with, an array buffer
    var arrayBufferReader = new FileReader();
    arrayBufferReader.onload = function () {
        handleArrayBuffer(arrayBufferReader.result);
    }

    arrayBufferReader.readAsArrayBuffer(musicFile);

}

//Loads and analyzes the example song
function getExampleAudio(){
    var xhr = new XMLHttpRequest();
    xhr.open('GET', window.location.href +  '/exampleSongs/FuriousFreak.mp3', true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e){
        handleArrayBuffer(this.response);
    }
    xhr.send();

}





