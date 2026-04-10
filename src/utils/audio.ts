// ========================================
// 音频采集与静音检测工具
// ========================================

import { ASR_CONFIG } from './constants'

export interface AudioProcessingOptions {
  enableAudioEnhancement: boolean
}

export interface ProcessedRecordingHandle {
  stream: MediaStream
  cleanup: () => void
}

export interface SilenceDetectionOptions {
  silenceDurationMs: number
  onSilence: () => void
}

export function buildAudioConstraints(
  options: AudioProcessingOptions,
): MediaTrackConstraints {
  if (!options.enableAudioEnhancement) {
    return {}
  }

  return {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 16000,
    sampleSize: 16,
  }
}

export function createProcessedRecordingStream(
  rawStream: MediaStream,
  options: AudioProcessingOptions,
): ProcessedRecordingHandle {
  if (!options.enableAudioEnhancement) {
    return {
      stream: rawStream,
      cleanup: () => undefined,
    }
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext
  }).webkitAudioContext

  if (!AudioContextCtor) {
    return {
      stream: rawStream,
      cleanup: () => undefined,
    }
  }

  const audioContext = new AudioContextCtor({ sampleRate: 16000 })
  const source = audioContext.createMediaStreamSource(rawStream)
  const highpass = audioContext.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 120

  const compressor = audioContext.createDynamicsCompressor()
  compressor.threshold.value = -50
  compressor.knee.value = 12
  compressor.ratio.value = 12
  compressor.attack.value = 0.003
  compressor.release.value = 0.25

  const gain = audioContext.createGain()
  gain.gain.value = 1.12

  const destination = audioContext.createMediaStreamDestination()

  source.connect(highpass)
  highpass.connect(compressor)
  compressor.connect(gain)
  gain.connect(destination)

  return {
    stream: destination.stream,
    cleanup: () => {
      source.disconnect()
      highpass.disconnect()
      compressor.disconnect()
      gain.disconnect()
      void audioContext.close().catch(() => undefined)
    },
  }
}

export class SilenceDetector {
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private hasSpeech = false
  private silentSince = 0

  async start(stream: MediaStream, options: SilenceDetectionOptions): Promise<void> {
    this.stop()

    const AudioContextCtor = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext

    if (!AudioContextCtor) {
      return
    }

    this.audioContext = new AudioContextCtor()
    this.source = this.audioContext.createMediaStreamSource(stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 2048
    this.source.connect(this.analyser)

    const buffer = new Float32Array(this.analyser.fftSize)

    this.timer = setInterval(() => {
      if (!this.analyser) return

      this.analyser.getFloatTimeDomainData(buffer)
      let sumSquares = 0
      for (let i = 0; i < buffer.length; i++) {
        sumSquares += buffer[i] * buffer[i]
      }

      const rms = Math.sqrt(sumSquares / buffer.length)
      const isSpeaking = rms >= ASR_CONFIG.SILENCE_RMS_THRESHOLD

      if (isSpeaking) {
        this.hasSpeech = true
        this.silentSince = 0
        return
      }

      if (!this.hasSpeech) {
        return
      }

      if (this.silentSince === 0) {
        this.silentSince = Date.now()
        return
      }

      if (Date.now() - this.silentSince >= options.silenceDurationMs) {
        options.onSilence()
        this.stop()
      }
    }, ASR_CONFIG.SILENCE_CHECK_INTERVAL)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.source?.disconnect()
    this.analyser?.disconnect()
    this.source = null
    this.analyser = null
    this.hasSpeech = false
    this.silentSince = 0

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined)
      this.audioContext = null
    }
  }
}
