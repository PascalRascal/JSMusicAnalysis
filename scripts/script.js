 /* global SpotifyWebApi */
/*
  The code for finding out the BPM / tempo is taken from this post:
  http://tech.beatport.com/2014/web-audio/beat-detection-using-web-audio/
 */

/* TODO List
 * 1. Improve Visualization
 * 2. Clean Up Code
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
var progressDiv = document.getElementById('analysisProgress');

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

playButton.addEventListener('click', function() {
    if (audioTag.paused) {
        audioTag.play();
    } else {
        audioTag.pause();
    }
});

result.style.display = 'none';


var getMusicData = function(musicArrayBuffer, songsize) {
    var musicDataView = new DataView(musicArrayBuffer);

    var mp3Tags = mp3Parser.readTags(musicDataView);
    console.log(mp3Tags);


    //The song sampling rate
    //TODO: Reimpliment this being dynamic

    //TODO: Impliment mp3-parser to get total frames, should be fun! ^_^
    //kill me
    var samplingRate =  44100;


    // Create offline context
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
        
        var renderedBuffer = e.renderedBuffer;
        console.log([renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)]);
        getWorkerPeaks([renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)], samplingRate, 4);
        /*
        console.log(e.renderedBuffer.duration);
        var peaks = getPeaks([buffer.getChannelData(0), buffer.getChannelData(1)], samplingRate, 4);
        var groups = getIntervals(peaks, samplingRate, [buffer.getChannelData(0), buffer.getChannelData(1)]);
        var sections = getSections(peaks, samplingRate, [buffer.getChannelData(0), buffer.getChannelData(1)]);
        */

       // drawData(peaks, sections, buffer);
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
            if(mp3tags._section.type === 'frame'){
                frameCount++;
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

}

function getWorkerPeaks(songData, samplingRate, peaksPerSecond) {
    worker.postMessage({'cmd': 'getPeaks', 'songData': songData, 'samplingRate': samplingRate, 'peaksPerSecond': peaksPerSecond});
 }

 function getWorkerIntervals(peaks, samplingRate){
     worker.postMesssage({'cmd': 'getIntervals', 'peaks': peaks, 'samplingRate': samplingRate});
 }

 function getWorkerSections(songData, peaks, samplingRate){
     worker.postMessage({'cmd': 'getSections', 'peaks': peaks, 'samplingRate': samplingRate, 'songData': songData});
 }

var worker = new Worker(URL.createObjectURL(new Blob(["("+worker_function.toString()+")()"], {type: 'text/javascript'})));

var workerPeaks;
var workerSongData;

worker.addEventListener('message', function(e) {
    var data = e.data;
    if(data.returnType == "peaks"){
        workerPeaks = data.peaks;
        console.log(workerPeaks);
        workerSongData = data.songData
        getWorkerSections(workerSongData, workerPeaks, data.samplingRate);
    } else if(data.returnType == "sections"){
        var sections = data.sections;
        drawData(workerPeaks, sections, workerSongData);
    }
}, false);

function drawData(peaks, sections, buffer){
        var svg = document.querySelector('#svg');
        svg.innerHTML = '';
        var svgNS = 'http://www.w3.org/2000/svg';
        var rect;

        sections.forEach(function(section, index) {
            rect = document.createElementNS(svgNS, 'rect');

            rect.setAttributeNS(null, 'x', (100 * section.start / buffer[0].length) + '%');
            rect.setAttributeNS(null, 'y', 0);
            rect.setAttributeNS(null, 'sectionIndex', index);
            console.log(sections[rect.getAttribute("sectionIndex")]);
            rect.setAttributeNS(null, 'fill', section.color);
            rect.addEventListener("click", function(){
                console.log(sections[rect.getAttribute("sectionIndex")].tempo);
            })
            if (section[index + 1]) {
                rect.setAttributeNS(null, 'width', (Math.abs(sections[index + 1].start - section.start)));
            } else {
                rect.setAttributeNS(null, 'width', (buffer[0].length - section.start));
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

        progressDiv.innerHTML = '';


        result.style.display = 'block';
    };




