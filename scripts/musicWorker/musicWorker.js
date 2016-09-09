function worker_function() {
      function getStandardDev(data, dataAvg) {
      var summation = 0;
      if (dataAvg) {
          data.forEach(function(item, index) {
              summation = summation + ((item.distanceToNext - dataAvg) * (item.distanceToNext - dataAvg))
          });
      }
      return Math.sqrt(summation / data.length);


  }

  function getPeaks(data, samplingRate, partsPerSecond) {
    console.log('Getting Peaks of Song');

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
//http://stackoverflow.com/questions/1484506/random-color-generator-in-javascript
function get_random_color() {
    var letters = 'ABCDE'.split('');
    var color = '#';
    for (var i=0; i<3; i++ ) {
        color += letters[Math.floor(Math.random() * letters.length)];
    }
    return color;
}

  var section = function(start, stdDev, samplingRate) {
      this.start = start;
      this.samplingRate = samplingRate;
      

      this.stdDev = stdDev;

      this.peaks = [];

      this.color = get_random_color();

  }

  function getSections(peaks, samplingRate, data, sectionMargin){
    var sections = [];
    var sectionMargin = sectionMargin;
    console.log(sectionMargin);
    var totalSongDuration = data[0].length / samplingRate;
    var totalSongSize = data[0].length;
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

    //Split the song into sections
    peaks.forEach(function(peak, index) {
        var peakDeviation = (peak.distanceToNext - avgDistance) / stdDev;
        //If the peak is within a the same deviation as the current section, add it to section peaks array, otherwise create a new section
        if (Math.abs(sections[sections.length - 1].stdDev - peakDeviation) > sectionMargin && peak.distanceToNext != 0) {
            var newSection = new section(peak.position, peakDeviation, samplingRate);
            newSection.peaks.push(peak);
            sections.push(newSection);
        }else{
            //Push the peak to the current section
            sections[sections.length - 1].peaks.push(peak);
        }
    });

    //Calculate section length and duration
    sections.forEach(function(section, index){
        if(sections[index + 1]){
            section.sectionData = [data[0].slice(section.start, sections[index + 1].start), data[1].slice(section.start, sections[index + 1].start)];
            section.end = sections[index + 1].start
            section.length = sections[index + 1].start - section.start
            section.duration = (sections[index + 1].start - section.start) / section.samplingRate;
        }else{
            section.end = data[0].length
            section.sectionData = [data[0].slice(section.start), data[1].slice(section.start)]
            section.length =  totalSongSize - section.start;
            section.duration =  section.length / section.samplingRate;
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
    averageBPM = totalBPM / totalSongDuration;

    return sections;
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

var myPeaks;
    self.addEventListener('message', function(e) {
        var data = e.data;
        if (data.cmd == "getPeaks"){
            console.log(e.data);
            myPeaks = getPeaks(data.songData, data.samplingRate, data.peaksPerSecond);
            self.postMessage({'returnType': 'peaks', 'peaks': myPeaks, 'songData': data.songData, 'samplingRate': data.samplingRate});
        }else if(data.cmd == "getSections"){
            console.log(data.songData);
            var sections = getSections(myPeaks, data.samplingRate, data.songData, data.sectionMargin);
            //After peaks have been analyzed, the section data can be deleted
            sections.forEach(function(section){
                section.sectionData = [];
            })
            console.log(sections);
            self.postMessage({'returnType': 'sections', 'sections': sections});
        }else if(data.cmd == "getIntervals"){
            var groups = getIntervals(data.peaks, data.samplingRate);
            self.postMessage({'returnType': 'groups', 'groups': groups});
        }
        
    })};



// This is in case of normal worker start
if(window!=self){
  worker_function();
}