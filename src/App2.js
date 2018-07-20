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
    // console.log(arr)
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
    // let gainNode = this._context.createGain();
    // source.connect(gainNode);
    // gainNode.connect(this._context.destination);
    // gainNode.gain.value = 0.1;
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

    const getsound = audio.fetchAudio(sounds, '/House_wave/')
    getsound
      .then(arr => {
        const getbuffer = arr.map(b => b.buffer)

        let bass = getbuffer.filter(a => a.duration < 2)
        let sounds3 = getbuffer.filter(a => a.duration > 2 && a.duration < 5)
        let sounds7 = getbuffer.filter(a => a.duration > 5 && a.duration < 10)
        let soundslong = getbuffer.filter(a => a.duration > 10)
        let name = ''

        const makeMusic = () => {
          let randbass = []
          let randsounds3 = []
          let randsounds7 = []

          const fsrand = () => {
            let nb = rand(bass.length)
            while (randbass.indexOf(nb) > -1) {
              console.log('double dodged')
              nb = rand(bass.length)
            }
            randbass.push(nb)
            return bass[nb]
          }
          const srand = () => {
            let nb = rand(sounds3.length)
            while (randsounds3.indexOf(nb) > -1) {
              console.log('double dodged')
              nb = rand(sounds3.length)
            }
            randsounds3.push(nb)
            return sounds3[nb]
          }
          const srand7 = () => {
            let nb = rand(sounds7.length)
            while (randsounds7.indexOf(nb) > -1) {
              console.log('double dodged')
              nb = rand(sounds7.length)
            }
            randsounds7.push(nb)
            return sounds7[nb]
          }
          // const slrand = soundslong[rand(soundslong.length)]

          // const smallbase = audio.mergeAudio([
          //   audio.concatAudio([fsrand()], 0, 2),
          //   audio.concatAudio([srand()], 0, 1),
          // ]);

          const fsrand1 = fsrand()
          const fsrand2 = fsrand()
          const fsrand3 = fsrand()

          const base = audio.mergeAudio([
            audio.concatAudio([fsrand1], 0, 2),
            audio.concatAudio([fsrand2], 0, 2),
            audio.concatAudio([fsrand3], 0, 2),
          ]);

          const smallbase = audio.concatAudio([base], 0, 2)
          const longBase = audio.concatAudio([base], 0, 4)

          let repeat = () => rand(6) + 4
          let middleBase = audio.mergeAudioLoop([fsrand1, fsrand2, fsrand()], repeat())

          const longBody1 = srand7()
          const longBody2 = audio.concatAudio([srand()], 0, 2)
          console.log(longBody1, longBody2)

          const body = audio.concatAudio([longBody1, longBody2], 0, 1)
          const body2 = audio.mergeAudioLoop([longBody1, longBody2], 2)

          const all = audio.mergeAudio([longBase, body])
          const all2 = audio.mergeAudio([longBase, body2])

          let merged = audio.concatAudio([smallbase, middleBase, all, all2, middleBase, smallbase])
          console.log('final duration :' + merged.duration);
          const output = audio.export(merged, 'audio/wav')
          // audio.play(merged)
          console.log(output);
          const download = audio.download(output.blob, '' + 1000000 + rand(1000000));

          if (--this.count > 0) {
            // console.log(this.count)
            makeMusic()
          }
        }
        makeMusic()

      })
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
  count = 1
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
        <input type="text" onChange={e => this.count = e.target.value} defaultValue="1" />
        <button onClick={this.run.bind(this)}>RUN</button>
      </div>
    );
  }
}

export default App;
