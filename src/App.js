import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

const frames = 48000
const alpha = "0ABCDEFGHIJK";
const nums = "1234567";
const Sounds = {
  Bass: [
    'Bajumbu',
    'Basspump',
    'Home',
    'OffOne',
    'Wapitty',
    'Warmy',
  ],
  Drums: [
    ['JazzyHouse', 11],   // K
    ['Kongo', 9],         // I
    ['Pardy', 10],        // J
    ['Seesaw', 8],        // H
    ['Subeat', 7],        // G
  ],
  Guitar: [
    'DiggitGtr',
    'Funklick',
    'ReggaeShrt',
    'Wahhh',
  ],
  Keys: [
    'Hambra',
    'Hambra',
    'IcySmile',
    'IslandBell',
    'Pannep',
    'Phasep',
    'Tonewashed',
  ],
  Pad: [
    'Cloudy',
    'Fallback',
    'Morphium',
    'Nightwash',
    'Shake Me',
  ],
  Sequence: [
    'DeepReggae',
    'Hartmann',
    'Illsynth',
    'Lowline',
    'RePete',
  ],
  Synth: [
    'BigTrance',
    'Birdbeach',
    'Duderino',
    'Duderino',
    'Glassman',
    'HarmonX',
    'Landshapes',
  ],
  Synth2: [
    'Bowmeister',
    'Bowmeister',
    'DelayDub',
    'Reggflange',
    'Simdeep',
    'Stackmarket',
    'Stackomio',
    'Wouw',
  ],
}

class Crunker {

  constructor() {
    this._context = this._createContext();
  }

  _createContext() {
    window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
    return new AudioContext();
  }

  async fetchAudio(...filepaths) {
    const files = filepaths.map(async filepath => {
      const buffer = await fetch(filepath).then(response => response.arrayBuffer());
      return await this._context.decodeAudioData(buffer);
    });
    return await Promise.all(files);
  }

  mergeAudio(buffers) {
    let output = this._context.createBuffer(1, frames * this._maxDuration(buffers), frames);

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

  concatAudio(buffers) {
    let output = this._context.createBuffer(1, frames * this._totalDuration(buffers), frames),
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

  concatAudioBlanc(buffers) {
    let output = this._context.createBuffer(1, frames * this._totalDuration(buffers) * 4, frames),
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
    return Math.max.apply(Math, buffers.map(buffer => buffer.duration));
  }

  _totalDuration(buffers) {
    return buffers.map(buffer => buffer.duration).reduce((a, b) => a + b, 0);
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

function randAlpha() {
  const numb = rand(11, 1)
  return
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

    const Bass = rand(Sounds.Bass.length)
    const Drums = rand(Sounds.Drums.length)
    const Guitar = rand(Sounds.Guitar.length)
    const Keys = rand(Sounds.Keys.length)
    const Pad = rand(Sounds.Pad.length)
    const Sequence = rand(Sounds.Sequence.length)
    const Synth = rand(Sounds.Synth.length)
    const Synth2 = rand(Sounds.Synth2.length)

    const drums = Sounds.Drums[Drums]

    const BassType = rand(7, 1)
    const DrumsType = rand(drums[1], 1)
    const GuitarType = rand(7, 1)
    const KeysType = rand(7, 1)
    const PadType = rand(7, 1)
    const SequenceType = rand(7, 1)
    const SynthType = rand(7, 1)
    const Synth2Type = rand(7, 1)


    audio.fetchAudio(
      'House_wave\\Bass\\' + Sounds.Bass[rand(Sounds.Bass.length)] + ' ' + BassType + '.wav',
      'House_wave\\Drums\\' + drums[0] + ' ' + alpha[DrumsType] + '.wav',
      'House_wave\\Guitar\\' + Sounds.Guitar[rand(Sounds.Guitar.length)] + ' ' + GuitarType + '.wav',
      'House_wave\\Keys\\' + Sounds.Keys[rand(Sounds.Keys.length)] + ' ' + KeysType + '.wav',
      'House_wave\\Pad\\' + Sounds.Pad[rand(Sounds.Pad.length)] + ' ' + PadType + '.wav',
      'House_wave\\Sequence\\' + Sounds.Sequence[rand(Sounds.Sequence.length)] + ' ' + SequenceType + '.wav',
      'House_wave\\Synth\\' + Sounds.Synth[rand(Sounds.Synth.length)] + ' ' + SynthType + '.wav',
      'House_wave\\Synth 2\\' + Sounds.Synth2[rand(Sounds.Synth2.length)] + ' ' + Synth2Type + '.wav',
    )
      .then(buffers => {
        const randomBuff = audio.mergeAudio([buffers[0], buffers[2]])
        // => [AudioBuffer, AudioBuffer]
        const maxLength = Math.max.apply(Math, buffers.map(buffer => buffer.length));
        // console.log(maxLength);
        let prevBlob = null
        let time = null
        let final = []
        // console.log(buffers);
        buffers = this.shuffle(buffers)

        buffers = buffers.map((buffer, index) => {
          const blob = audio.concatAudioBlanc([buffer])
          // const blob = buffer.length < maxLength ? audio.concatAudio([buffer, buffer]) : buffer
          prevBlob = prevBlob ? audio.mergeAudio([blob, prevBlob]) : blob
          time += prevBlob.duration
          return prevBlob
        })

        console.log('before : ' + time)
        while (time < 60) {
          buffers.push(prevBlob)
          time += prevBlob.duration
        }

        const randomRepeat = rand(5, 2)
        if (time < 90) {
          for (let i = 1; i < randomRepeat; i++) {
            buffers.push(randomBuff)
            time += randomBuff.duration
          }
        }
        console.log('after : ' + time)
        // console.log(buffers);

        let merged = audio.concatAudio(buffers)
        // console.log(merged)
        if (merged === false) {
          if (--this.count > 0) {
            this.run()
          }
          return
        }
        // console.log(merged);
        console.log('final duration :' + merged.duration);
        const output = audio.export(merged, 'audio/wav')
        audio.play(merged)
        // console.log(output);
        // const download = audio.download(output.blob, '' + Bass + BassType + Drums + DrumsType + Guitar + GuitarType + Keys + KeysType + Pad + PadType + Sequence + SequenceType + Synth + SynthType + Synth2 + Synth2Type);
        if (--this.count > 0) {
          this.run(this.count)
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

  runMusic() {
    count = count || this.count

    const Bass = rand(Sounds.Bass.length)
    const Drums = rand(Sounds.Drums.length)
    const Guitar = rand(Sounds.Guitar.length)
    const Keys = rand(Sounds.Keys.length)
    const Pad = rand(Sounds.Pad.length)
    const Sequence = rand(Sounds.Sequence.length)
    const Synth = rand(Sounds.Synth.length)
    const Synth2 = rand(Sounds.Synth2.length)

    const drums = Sounds.Drums[Drums]

    const BassType = rand(7, 1)
    const DrumsType = rand(drums[1], 1)
    const GuitarType = rand(7, 1)
    const KeysType = rand(7, 1)
    const PadType = rand(7, 1)
    const SequenceType = rand(7, 1)
    const SynthType = rand(7, 1)
    const Synth2Type = rand(7, 1)


    audio.fetchAudio(
      'House_wave\\Bass\\' + Sounds.Bass[Bass] + ' ' + BassType + '.wav',
      'House_wave\\Drums\\' + drums[0] + ' ' + alpha[DrumsType] + '.wav',
      'House_wave\\Guitar\\' + Sounds.Guitar[Guitar] + ' ' + GuitarType + '.wav',
      'House_wave\\Keys\\' + Sounds.Keys[Keys] + ' ' + KeysType + '.wav',
      'House_wave\\Pad\\' + Sounds.Pad[Pad] + ' ' + PadType + '.wav',
      'House_wave\\Sequence\\' + Sounds.Sequence[Sequence] + ' ' + SequenceType + '.wav',
      'House_wave\\Synth\\' + Sounds.Synth[Synth] + ' ' + SynthType + '.wav',
      'House_wave\\Synth 2\\' + Sounds.Synth2[Synth2] + ' ' + Synth2Type + '.wav',
    )
      .then(buffers => {
        //const randomBuff = audio.mergeAudio([buffers[0], buffers[2]])
        // => [AudioBuffer, AudioBuffer]
        const maxLength = Math.max.apply(Math, buffers.map(buffer => buffer.length));
        // console.log(maxLength);
        let prevBlob = null
        let time = null
        let final = []
        // console.log(buffers);
        buffers = this.shuffle(buffers)

        buffers = buffers.map((buffer, index) => {
          const blob = buffer
          console.log(buffer)
          // const blob = buffer.length < maxLength ? audio.concatAudio([buffer, buffer]) : buffer
          prevBlob = prevBlob ? audio.mergeAudio([blob, prevBlob]) : blob
          time += prevBlob.duration
          return prevBlob
        })

        console.log('<<<<<<<<<<<<<<<<<')
        console.log('before : ' + time)
        while (time < 50) {
          buffers.push(prevBlob)
          time += prevBlob.duration
        }
        console.log('before loop: ' + time)

        audio.fetchAudio(
          'House_wave\\Keys\\Tonewashed ' + KeysType + '.wav',
          'House_wave\\Synth 2\\Wouw ' + Synth2Type + '.wav',
        )
          .then(buffers2 => {
            let randomBuff = audio.mergeAudio(buffers2)

            const randomRepeat = rand(5, 1)
            while (time < 65) {
              buffers.push(randomBuff)
              time += randomBuff.duration
            }
            console.log('before end loop: ' + time)
            console.log('duration random: ' + randomBuff.duration)
            console.log(randomRepeat)
            for (let i = 1; i < randomRepeat; i++) {
              if (time + randomBuff.duration < 75) {
                buffers.push(randomBuff)
                time += randomBuff.duration
              }
            }

            console.log('after : ' + time)
            // console.log(buffers);

            let merged = audio.concatAudio(buffers)
            // console.log(merged)
            if (merged === false) {
              if (--this.count > 0) {
                this.runMusic()
              }
              return
            }
            // console.log(merged);
            console.log('final duration :' + merged.duration);
            const output = audio.export(merged, 'audio/wav')
            // console.log(output);
            // audio.play(merged)
            const download = audio.download(output.blob, '' + Bass + BassType + Drums + DrumsType + Guitar + GuitarType + Keys + KeysType + Pad + PadType + Sequence + SequenceType + Synth + SynthType + Synth2 + Synth2Type);
            if (--this.count > 0) {
              this.runMusic(this.count)
            }
          })
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
        <input type="text" value={this.count} onChange={e => this.count = e.target.value} />
        <button onClick={this.run.bind(this)}>RUN</button>
        <button onClick={this.runMusic.bind(this)}>RUN2</button>
      </div>
    );
  }
}

export default App;
