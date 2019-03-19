import React, { Component } from 'react';
import Pizzicato from 'pizzicato';
import logo from './logo.svg';
import './App.css';

function rand(max, min = 1) {
  return Math.floor(Math.random() * Math.floor(max)) + min;
}

const randSound = (range, str) => {
  let nb = rand(range)
  return str.replace('*', nb)
}

const frames = 44100
let i = 0

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
    let output = this._context.createBuffer(2, this._maxDuration(buffers), frames);
    buffers.map(buffer => {
      try {
        if (!buffer) { return }
        for (let i = buffer.getChannelData(0).length - 1; i >= 0; i--) {
          output.getChannelData(0)[i] += buffer.getChannelData(0)[i];
        }
        for (let i = buffer.getChannelData(1).length - 1; i >= 0; i--) {
          output.getChannelData(1)[i] += buffer.getChannelData(1)[i];
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
    let output = this._context.createBuffer(2, length * loop, frames),
      offset = 0;

    while (loop-- > 0) {
      // buffers = shuffle(buffers)
      buffers.map(buffer => {
        if (!buffer) { return }
        try {
          output.getChannelData(0).set(buffer.getChannelData(0), offset);
          output.getChannelData(1).set(buffer.getChannelData(1), offset);
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
    const arr = buffers.map(buffer => buffer ? buffer.length : 0)
    return Math.max(...arr);
  }

  _totalDuration(buffers) {
    return buffers.map(buffer => buffer && buffer.length).reduce((a, b) => a + b, 0);
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
    const makeMusic = () => {
      let type = rand(4, 1)
      let Sounds = [null,
        [
          randSound(56, 'Bass (*).WAV'),
          randSound(56, 'Bass (*).WAV'),
          randSound(28, 'Drums (*).WAV'),
          randSound(28, 'Drums (*).WAV'),
          randSound(35, 'Keys (*).WAV'),
          randSound(35, 'Keys (*).WAV'),
          randSound(63, 'Perc (*).WAV'),
          randSound(63, 'Perc (*).WAV'),
          randSound(49, 'Seq (*).WAV'),
          randSound(49, 'Seq (*).WAV'),
          randSound(77, 'Synth (*).WAV'),
          randSound(77, 'Synth (*).WAV'),

          randSound(21, 'Guitar (*).WAV'),
          randSound(21, 'Guitar (*).WAV'),
        ],
        [
          randSound(63, 'Bass (*).WAV'),
          randSound(63, 'Bass (*).WAV'),
          randSound(32, 'Drums (*).WAV'),
          randSound(32, 'Drums (*).WAV'),
          randSound(91, 'Keys (*).WAV'),
          randSound(91, 'Keys (*).WAV'),
          randSound(64, 'Perc (*).WAV'),
          randSound(64, 'Perc (*).WAV'),
          randSound(49, 'Seq (*).WAV'),
          randSound(49, 'Seq (*).WAV'),
          randSound(63, 'Synth (*).WAV'),
          randSound(63, 'Synth (*).WAV'),

          randSound(21, 'Pad (*).WAV'),
          randSound(21, 'Pad (*).WAV'),
        ],
        [
          randSound(56, 'Bass (*).WAV'),
          randSound(56, 'Bass (*).WAV'),
          randSound(85, 'Drums (*).WAV'),
          randSound(85, 'Drums (*).WAV'),
          randSound(35, 'Keys (*).WAV'),
          randSound(35, 'Keys (*).WAV'),
          randSound(54, 'Perc (*).WAV'),
          randSound(54, 'Perc (*).WAV'),
          randSound(49, 'Seq (*).WAV'),
          randSound(70, 'Seq (*).WAV'),
          randSound(70, 'Synth (*).WAV'),
          randSound(70, 'Synth (*).WAV'),

          randSound(49, 'Pad (*).WAV'),
          randSound(49, 'Pad (*).WAV'),
        ],
        [
          randSound(42, 'Bass (*).WAV'),
          randSound(42, 'Bass (*).WAV'),
          randSound(45, 'Drums (*).WAV'),
          randSound(45, 'Drums (*).WAV'),
          randSound(49, 'Keys (*).WAV'),
          randSound(49, 'Keys (*).WAV'),
          randSound(54, 'Perc (*).WAV'),
          randSound(54, 'Perc (*).WAV'),
          randSound(35, 'Seq (*).WAV'),
          randSound(35, 'Seq (*).WAV'),
          randSound(105, 'Synth (*).WAV'),
          randSound(105, 'Synth (*).WAV'),

          rand(2) ? randSound(28, 'Guitar (*).WAV') : randSound(35, 'Pad (*).WAV'),
          rand(2) ? randSound(28, 'Guitar (*).WAV') : randSound(35, 'Pad (*).WAV'),
        ]
      ]
      console.log(type, Sounds[type])
      let sounds
      let longest = 0

      const getSounds = audio.fetchAudio(Sounds[type], '/' + type + '/').then((arr) => {
        sounds = arr.map(b => {
          longest = b.buffer.length > longest ? b.buffer.length : longest
          return b.buffer
        })
      })

      const music = []

      getSounds.then(() => {
        console.log(sounds, longest)

        sounds = sounds.map((sound, i) => {
          let multi = longest / sound.length
          try {
            multi = (multi + '').split('.')[1][0] > 5 ? Math.ceil(multi) : Math.floor(multi)
          }
          catch (e) { }

          sound = audio.concatAudio([sound], 0, multi)

          return sound
        })

        let index = 0

        const Bass = sounds[index++]
        const Bass2 = sounds[index++]
        const Drums = sounds[index++]
        const Drums2 = sounds[index++]
        const Keys = sounds[index++]
        const Keys2 = sounds[index++]
        const Perc = sounds[index++]
        const Perc2 = sounds[index++]
        const Seq = sounds[index++]
        const Seq2 = sounds[index++]
        const Synth = sounds[index++]
        const Synth2 = sounds[index++]
        const PadGuitar = sounds[index++]
        const PadGuitar2 = sounds[index++]

        const PK = rand(2) ? Perc : Keys
        const PK2 = rand(2) ? Perc2 : Keys2

        const S2 = rand(2) ? Seq : Synth
        const S22 = rand(2) ? Seq2 : Synth2

        const base = [
          audio.mergeAudio([Bass, Drums]),
          audio.mergeAudio([Bass2, Drums2, PK]),
          audio.mergeAudio([Bass, Drums, PK, PK2]),
          audio.mergeAudio([Bass2, Drums2, PK2, S2]),
          audio.mergeAudio([Bass, Drums, S2, S22]),
          audio.mergeAudio([Bass2, Drums2, S22, PK]),
          audio.mergeAudio([Bass, Drums, PK, PK2]),
          audio.mergeAudio([Bass2, Drums2, PK2, PadGuitar]),
          audio.mergeAudio([Bass, Drums, PadGuitar, PadGuitar2]),
        ]

        console.log(music)

        let merged = audio.concatAudio(base)
        console.log('final duration :' + merged.duration);
        const output = audio.export(merged, 'audio/wav')
        setTimeout(() => {
          audio.play(merged)
        }, time);
        time += merged.duration * 1000 + 1000
        console.log(merged);
        const download = audio.download(output.blob, '' + 1000000 + rand(1000000));
      })
        .catch((error) => {
          // => Error Message
          console.log(error)
        });

      if (this.count - ++i > 0) {
        // console.log(this.count)
        makeMusic()
      }
    }
    let i = 0
    let time = 0
    makeMusic()

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
    // this.run.bind(this)()
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
