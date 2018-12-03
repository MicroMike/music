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
    let type = rand(2)
    let Sounds = [null,
      [
        randSound(56, 'Bass (*).WAV'),
        randSound(28, 'Drums (*).WAV'),
        randSound(21, 'Guitar (*).WAV'),
        randSound(21, 'Guitar (*).WAV'),
        randSound(35, 'Keys (*).WAV'),
        randSound(35, 'Keys (*).WAV'),
        randSound(63, 'Perc (*).WAV'),
        randSound(63, 'Perc (*).WAV'),
        randSound(49, 'Seq (*).WAV'),
        randSound(77, 'Synth (*).WAV')
      ],
      [
        randSound(63, 'Bass (*).WAV'),
        randSound(32, 'Drums (*).WAV'),
        randSound(21, 'Pad (*).WAV'),
        randSound(91, 'Keys (*).WAV'),
        randSound(64, 'Perc (*).WAV'),
        randSound(49, 'Seq (*).WAV'),
        randSound(63, 'Synth (*).WAV')
      ]
    ]
    console.log(type)
    let sounds
    let longest = 0
    const makeMusic = () => {
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
          // if (i > 0) {
          //   music.push(audio.mergeAudio([sound, music[music.length - 1]]))
          // }
          // else {
          //   music.push(sound)
          // }

          return sound
        })

        let index = 0

        const Bass = sounds[index++]
        const Drums = sounds[index++]
        const Guitar = sounds[index++]
        const Guitar2 = sounds[index++]
        const Keys = sounds[index++]
        const Keys2 = sounds[index++]
        const Perc = sounds[index++]
        const Perc2 = sounds[index++]
        const Seq = sounds[index++]
        const Synth = sounds[index++]

        const base = audio.mergeAudio([Bass, Drums])
        const base1 = audio.mergeAudio([Bass, Drums, Guitar])
        const base2 = audio.mergeAudio([Bass, Drums, Guitar2])

        const base3 = audio.mergeAudio([Bass, Drums, Keys])
        const base4 = audio.mergeAudio([Bass, Drums, Keys2])

        const base5 = audio.mergeAudio([Bass, Drums, Perc])
        const base6 = audio.mergeAudio([Bass, Drums, Perc2])

        const step1 = audio.concatAudio([base, base1, base2, base3, base4, base5, base6])

        console.log(music)

        // const small1 = audio.concatAudio([smallSounds[0]], 0, 2)
        // const small2 = audio.concatAudio([smallSounds[1]], 0, 2)
        // const small3 = audio.concatAudio([smallSounds[2]], 0, 2)
        // const small4 = audio.concatAudio([smallSounds[3]], 0, 2)
        // const small5 = audio.concatAudio([smallSounds[4]], 0, 2)

        // const middle1 = middleSounds[0]
        // const middle2 = middleSounds[1]

        // const long1 = longSounds[0]
        // const long2 = longSounds[1]

        // const base = audio.mergeAudio([small1, small2]);
        // const longBase = audio.concatAudio([base], 0, 2)

        // const base1 = audio.mergeAudio([base, small3]);
        // const base2 = audio.mergeAudio([base, small4]);
        // const base2bis = audio.mergeAudio([base, audio.mergeAudio([small3, small4])]);

        // const base3 = audio.mergeAudio([base, middle1]);
        // const base4 = audio.mergeAudio([base, middle2]);

        // const base5 = audio.mergeAudio([longBase, long1]);
        // const base6 = audio.mergeAudio([longBase, long2]);

        let merged = audio.concatAudio([step1])
        console.log('final duration :' + merged.duration);
        const output = audio.export(merged, 'audio/wav')
        audio.play(merged)
        console.log(output);
        // const download = audio.download(output.blob, '' + 1000000 + rand(1000000));
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
