import Groq from 'groq-sdk';
import { config } from './config';

/**
 * Service for speech-to-text conversion using Groq's Whisper models
 */
export class SpeechToTextService {
  private groq: Groq;
  private model: string;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY!,
    });
    this.model = config.speechToText.model;
  }

  /**
   * Transcribe audio file to text
   */
  async transcribeAudio(audioFile: File): Promise<string> {
    try {
      // Validate file size
      if (audioFile.size > config.speechToText.maxFileSize) {
        throw new Error(`Audio file too large. Max size: ${config.speechToText.maxFileSize / (1024 * 1024)}MB`);
      }

      // Validate file format
      const fileExtension = audioFile.name.split('.').pop()?.toLowerCase();
      if (!fileExtension || !config.speechToText.supportedFormats.includes(fileExtension as any)) {
        throw new Error(`Unsupported audio format. Supported: ${config.speechToText.supportedFormats.join(', ')}`);
      }

      // Create form data for the API request
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('model', this.model);
      formData.append('response_format', 'json');
      formData.append('language', 'en'); // Default to English, can be made configurable

      // Call Groq Whisper API
      const transcription = await this.groq.audio.transcriptions.create({
        file: audioFile,
        model: this.model,
        response_format: 'json',
        language: 'en',
      });

      return transcription.text;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error(`Speech-to-text failed: ${error}`);
    }
  }

  /**
   * Transcribe audio with additional options
   */
  async transcribeWithOptions(
    audioFile: File,
    options: {
      language?: string;
      prompt?: string;
      temperature?: number;
      timestamp_granularities?: ('word' | 'segment')[];
    } = {}
  ): Promise<{
    text: string;
    segments?: any[];
    words?: any[];
  }> {
    try {
      const transcription = await this.groq.audio.transcriptions.create({
        file: audioFile,
        model: this.model,
        response_format: 'verbose_json',
        language: options.language || 'en',
        prompt: options.prompt,
        temperature: options.temperature || 0,
        timestamp_granularities: options.timestamp_granularities,
      });

      return {
        text: transcription.text,
        segments: (transcription as any).segments,
        words: (transcription as any).words,
      };
    } catch (error) {
      console.error('Error transcribing audio with options:', error);
      throw error;
    }
  }

  /**
   * Get transcription cost estimation
   */
  getTranscriptionCost(durationMinutes: number): number {
    // Groq Whisper pricing: approximately $0.006 per minute
    return durationMinutes * 0.006;
  }

  /**
   * Get service configuration
   */
  getServiceInfo() {
    return {
      model: this.model,
      provider: 'groq',
      maxFileSize: config.speechToText.maxFileSize,
      supportedFormats: config.speechToText.supportedFormats,
      features: ['transcription', 'translation', 'timestamps']
    };
  }

  /**
   * Validate audio file before processing
   */
  validateAudioFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > config.speechToText.maxFileSize) {
      return {
        valid: false,
        error: `File too large. Max size: ${config.speechToText.maxFileSize / (1024 * 1024)}MB`
      };
    }

    // Check file format
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !config.speechToText.supportedFormats.includes(fileExtension as any)) {
      return {
        valid: false,
        error: `Unsupported format. Supported: ${config.speechToText.supportedFormats.join(', ')}`
      };
    }

    return { valid: true };
  }
}

/**
 * Singleton instance of the speech-to-text service
 */
let speechToTextServiceInstance: SpeechToTextService | null = null;

export function getSpeechToTextService(): SpeechToTextService {
  if (!speechToTextServiceInstance) {
    speechToTextServiceInstance = new SpeechToTextService();
  }
  return speechToTextServiceInstance;
}