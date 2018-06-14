import React, { Component } from 'react';
import Pizzicato from 'pizzicato';
import logo from './logo.svg';
import './App.css';

const frames = 44100
let sounds = []
let i = 0
while (++i <= 339) {
  sounds.push('Sound (' + i + ').WAV')
}

class Crunker {

  constructor() {
    this._context = this._createContext();
  }

  _createContext() {
    window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
    return new AudioContext();
  }

  async fetchAudio(filepaths, path) {
    const files = filepaths.map(async filepath => {
      const buffer = await fetch(path + filepath).then(response => response.arrayBuffer());
      return {
        buffer: await this._context.decodeAudioData(buffer),
        src: path + filepath
      };
    });
    return await Promise.all(files);
  }

  mergeAudio(buffers) {
    let output = this._context.createBuffer(1, this._maxDuration(buffers), frames);

    buffers.map(buffer => {
      try {
        for (let i = buffer.getChannelData(0).length - 1; i >= 0; i--) {
          output.getChannelData(0)[i] += buffer.getChannelData(0)[i];
        }
      }
      catch (e) {
        console.log(e)
        return false
      }
    });
    return output;
  }

  mergeAudioLoop(buffers, loop) {
    let arr = [];
    for (let i = 0; i < loop; i++) {
      arr.push(this.mergeAudio(buffers))
    }
    console.log(arr)
    return this.concatAudio(arr)
  }

  concatAudio(buffers, time = 0, loop = 1) {
    const length = time ? time * 48000 * buffers.length : this._totalDuration(buffers)
    let output = this._context.createBuffer(1, length * loop, frames),
      offset = 0;

    while (loop-- > 0) {
      // buffers = shuffle(buffers)
      buffers.map(buffer => {
        try {
          output.getChannelData(0).set(buffer.getChannelData(0), offset);
        }
        catch (e) {
          console.log(buffer, e)
          return false
        }
        offset += time ? time * 48000 : buffer.length;
      });
    }
    return output;
  }

  concatAudioBlanc(buffers) {
    let output = this._context.createBuffer(1, this._totalDuration(buffers) * 4, frames),
      offset = 0;
    buffers.map(buffer => {
      try {
        output.getChannelData(0).set(buffer.getChannelData(0), offset);
      }
      catch (e) {
        console.log(e)
        return false
      }
      offset += buffer.length;
    });
    return output;
  }

  play(buffer) {
    const source = this._context.createBufferSource();
    source.buffer = buffer;
    source.connect(this._context.destination);
    source.start();
    return source;
  }

  export(buffer, audioType) {
    const type = audioType || 'audio/mp3';
    const recorded = this._interleave(buffer);
    const dataview = this._writeHeaders(recorded);
    const audioBlob = new Blob([dataview], { type: type });

    return {
      blob: audioBlob,
      url: this._renderURL(audioBlob),
      element: this._renderAudioElement(audioBlob, type),
    }
  }

  download(blob, filename) {
    const name = filename || 'crunker';
    const a = document.createElement("a");
    a.style = "display: none";
    a.href = this._renderURL(blob);
    a.download = `${name}.${blob.type.split('/')[1]}`;
    a.click();
    return a;
  }

  notSupported(callback) {
    return !this._isSupported() && callback();
  }

  close() {
    this._context.close();
    return this;
  }

  _maxDuration(buffers) {
    return Math.max.apply(Math, buffers.map(buffer => buffer.length));
  }

  _totalDuration(buffers) {
    return buffers.map(buffer => buffer.length).reduce((a, b) => a + b, 0);
  }

  _isSupported() {
    return 'AudioContext' in window;
  }

  _writeHeaders(buffer) {
    let arrayBuffer = new ArrayBuffer(44 + buffer.length * 2),
      view = new DataView(arrayBuffer);

    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 32 + buffer.length * 2, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, frames, true);
    view.setUint32(28, frames * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    this._writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * 2, true);

    return this._floatTo16BitPCM(view, buffer, 44);
  }

  _floatTo16BitPCM(dataview, buffer, offset) {
    for (var i = 0; i < buffer.length; i++ , offset += 2) {
      let tmp = Math.max(-1, Math.min(1, buffer[i]));
      dataview.setInt16(offset, tmp < 0 ? tmp * 0x8000 : tmp * 0x7FFF, true);
    }
    return dataview;
  }

  _writeString(dataview, offset, header) {
    let output;
    for (var i = 0; i < header.length; i++) {
      dataview.setUint8(offset + i, header.charCodeAt(i));
    }
  }

  _interleave(input) {
    let buffer = input.getChannelData(0),
      length = buffer.length * 2,
      result = new Float32Array(length),
      index = 0, inputIndex = 0;

    while (index < length) {
      result[index++] = buffer[inputIndex];
      result[index++] = buffer[inputIndex];
      inputIndex++;
    }
    return result;
  }

  _renderAudioElement(blob, type) {
    const audio = document.createElement('audio');
    audio.controls = 'controls';
    audio.type = type;
    audio.src = this._renderURL(blob);
    return audio;
  }

  _renderURL(blob) {
    return (window.URL || window.webkitURL).createObjectURL(blob);
  }

}

function rand(max, min = 0) {
  return Math.floor(Math.random() * Math.floor(max)) + min;
}

function randSound(nb, max) {
  const rands = []
  for (let i = 0; i < nb; i++) {
    rands.push(rand(max, 1))
  }
  return rands
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

const lowPassFilter = (s, f, p) => {
  const filter = new Pizzicato.Effects.LowPassFilter({
    frequency: f,
    peak: p
  });

  s.addEffect(filter);
  // s.play();
  return s;
}

const HighPassFilter = (s, f, p) => {
  var filter = new Pizzicato.Effects.HighPassFilter({
    frequency: f,
    peak: p
  });

  s.addEffect(filter);
  // s.play();
  return s;
}

const audio = new Crunker();
let count

class App extends Component {
  constructor() {
    super()
    this.count
  }
  run() {
    count = count || this.count

    // let end
    // let tempo = 0.075

    // for (let filename of sounds) {
    //   const s = new Pizzicato.Sound('/Wav/' + filename, () => {
    //     let notes = []
    //     for (let i = 0; i < 20000; i += 2000) {
    //       const b = HighPassFilter(s, i, 10)
    //       let news = b.getRawSourceNode().buffer
    //       if (tempo > 0.1) {
    //         end = audio.concatAudio([end, news], tempo)
    //       }
    //       else {
    //         end = news
    //       }
    //       tempo += 0.025
    //     }
    //     audio.play(end)
    //   })
    //   break
    // }

    const getsound = audio.fetchAudio(sounds, '/House_wave/')
    getsound
      .then(arr => {
        const getbuffer = arr.map(b => b.buffer)
        const bass = [[
          getbuffer[0]
        ],
        [
          getbuffer[1],
          getbuffer[2],
          getbuffer[3],
        ],
        [
          getbuffer[4],
          getbuffer[5],
          getbuffer[6],
          getbuffer[7],
          getbuffer[8],
          getbuffer[9],
          getbuffer[10],
        ],
        [
          getbuffer[11],
          getbuffer[12],
          getbuffer[13],
          getbuffer[14],
          getbuffer[15],
          getbuffer[16],
          getbuffer[17],
        ]]

        let sounds3 = getbuffer.filter(a => a.duration > 2 && a.duration < 5)
        let sounds7 = getbuffer.filter(a => a.duration > 5 && a.duration < 10)
        let soundslong = getbuffer.filter(a => a.duration > 10)

        const makeMusic = () => {
          const frand = rand(bass.length);
          const fsrand = bass[frand][rand(bass[frand].length)]
          const srand = sounds3[rand(sounds3.length)]
          const srand7 = () => sounds7[rand(sounds7.length)]
          const slrand = soundslong[rand(soundslong.length)]

          console.log(frand,
            fsrand,
            srand,
            srand7,
            slrand
          )

          const music = [
            audio.concatAudio([fsrand], 0, 16),
            audio.concatAudio([srand], 0, 8),
            audio.concatAudio([srand7(), srand7(), srand7(), srand7()]),
            // audio.concatAudio([slrand], 0, 2),
          ];

          console.log(music)
          // let merged1 = audio.mergeAudio(music)
          // let merged2 = audio.mergeAudio(music2)
          // let merged = audio.concatAudio([merged1, merged2]);
          let merged = audio.mergeAudioLoop(music, 1)
          // console.log(merged)
          console.log('final duration :' + merged.duration);
          const output = audio.export(merged, 'audio/wav')
          audio.play(merged)
          // console.log(output);
          // const download = audio.download(output.blob, '' + frand + fsrand + srand + srand7 + slrand);
        }

        if (--this.count >= 0) {
          console.log('...')
          makeMusic()
        }
        // console.log(download);
        // audio.mergeAudio(buffers)
      })
      // .then(merged => {
      //   // => AudioBuffer
      //   audio.export(merged, 'audio/mp3')
      // })
      // .then(output => {
      //   // => {blob, element, url}
      //   audio.download(output.blob);
      //   document.append(output.element);
      //   console.log(output.url);
      // })
      .catch((error) => {
        // => Error Message
      });

    audio.notSupported(() => {
      // Handle no browser support
      console.log('not')
    });
  }

  shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  }

  render() {
    // this.run(10)
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to React</h1>
        </header>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
        <input type="text" value={this.count} ref={e => this.count = e.value} defaultValue="1" />
        <button onClick={this.run.bind(this)}>RUN</button>
      </div>
    );
  }
}

export default App;
