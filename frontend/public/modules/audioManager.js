// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// AudioManager class to handle all audio-related operations
export class AudioManager {
    constructor() {
        this.currentAudio = null;
        this.currentAudioController = null;
        this.currentStreamController = null; // For aborting the audio stream fetch
        this.currentEventSource = null;
        this.audioQueue = [];
        this.isStreamPlaying = false;
    }

    stopAudio() {
        console.log('AudioManager: stopAudio called');
        
        // Stop current audio playback
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
            console.log('AudioManager: Current audio paused and cleared');
        }
        
        // Abort fetch controller (for old method)
        if (this.currentAudioController) {
            this.currentAudioController.abort();
            this.currentAudioController = null;
        }
        
        // Close SSE connection
        if (this.currentEventSource) {
            this.currentEventSource.close();
            this.currentEventSource = null;
        }
        
        // Abort the streaming audio fetch request
        if (this.currentStreamController) {
            this.currentStreamController.abort();
            this.currentStreamController = null;
            console.log('AudioManager: Current audio stream fetch aborted');
        }
        
        // Clear audio queue
        this.audioQueue = [];
        this.isStreamPlaying = false;
        console.log('AudioManager: Audio queue cleared and stream playing flag reset');
    }

    async playAudio(text) {
        // For now, keep the old method for backward compatibility
        // This can be used as a fallback
        this.stopAudio();
        this.currentAudioController = new AbortController();

        try {
            const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/function-audio-output', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text }),
                signal: this.currentAudioController.signal
            });

            if (!response.ok) {
                throw new Error('Failed to generate audio');
            }

            const { audio } = await response.json();
            this.currentAudio = new Audio(`data:audio/wav;base64,${audio}`);
            this.currentAudio.play();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Audio request was cancelled');
            } else {
                console.error('Error playing audio:', error);
            }
        }
    }

    playStreamedAudio(text) {
        // Stop any existing audio/streams
        this.stopAudio();

        // Create SSE connection for streaming audio
        // Using POST body for text is more complex with EventSource, 
        // so we'll use a hybrid approach with POST to initiate
        this._startStreamingAudio(text);
    }

    async _startStreamingAudio(text) {
        // Create a new AbortController for this specific stream
        this.currentStreamController = new AbortController();
        const signal = this.currentStreamController.signal;

        try {
            console.log('AudioManager: Starting new audio stream');
            
            const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/function-audio-output', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'  // Signal that we want streaming
                },
                body: JSON.stringify({ text }),
                signal: signal // Pass the signal to fetch
            });

            if (!response.ok) {
                throw new Error(`Failed to start audio stream: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                // Check if aborted before reading
                if (signal.aborted) {
                    console.log('AudioManager: Stream read loop detected abort signal');
                    throw new DOMException('Aborted by user', 'AbortError');
                }
                
                const { done, value } = await reader.read();
                if (done) {
                    console.log('AudioManager: Stream reader finished (done)');
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        const eventType = line.substring(6).trim();
                        continue;
                    }
                    if (line.startsWith('data:')) {
                        const data = line.substring(5).trim();
                        if (data) {
                            try {
                                const parsed = JSON.parse(data);
                                this._handleStreamEvent(parsed);
                            } catch (e) {
                                console.error('Error parsing SSE data:', e);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('AudioManager: Audio stream fetch was aborted');
            } else {
                console.error('AudioManager: Error in audio streaming:', error);
            }
        } finally {
            console.log('AudioManager: _startStreamingAudio finally block');
            // Clear the controller if it was the one for this stream
            if (this.currentStreamController && this.currentStreamController.signal === signal) {
                this.currentStreamController = null;
                console.log('AudioManager: Cleared stream controller as stream ended');
            }
        }
    }

    _handleStreamEvent(data) {
        // Check if the stream was aborted
        if (this.currentStreamController && this.currentStreamController.signal.aborted) {
            console.log('AudioManager: _handleStreamEvent detected abort, not queuing audio');
            return;
        }

        if (data.audio) {
            // Add audio chunk to queue
            this.audioQueue.push(data.audio);
            console.log(`AudioManager: Added audio chunk ${data.sentence_index + 1}/${data.total_sentences} to queue. Queue size: ${this.audioQueue.length}`);
            
            // Start playing if not already playing
            this._playNextFromQueue();
        } else if (data.error) {
            console.error('AudioManager: Stream error event:', data.error);
        } else if (data.message === 'Stream finished') {
            console.log('AudioManager: Audio stream finished event received');
        }
    }

    _playNextFromQueue() {
        // If already playing or queue is empty, return
        if (this.isStreamPlaying || this.audioQueue.length === 0) {
            if (this.isStreamPlaying) console.log('AudioManager: _playNextFromQueue - already playing');
            if (this.audioQueue.length === 0) console.log('AudioManager: _playNextFromQueue - queue empty');
            return;
        }

        // Check if the stream was aborted before playing next
        if (this.currentStreamController && this.currentStreamController.signal.aborted) {
            console.log('AudioManager: _playNextFromQueue detected abort, not playing next from queue');
            this.audioQueue = []; // Clear queue as the stream is aborted
            this.isStreamPlaying = false;
            return;
        }

        this.isStreamPlaying = true;
        const audioBase64 = this.audioQueue.shift();
        console.log(`AudioManager: Playing next from queue. Remaining: ${this.audioQueue.length}`);

        // Create audio element
        this.currentAudio = new Audio(`data:audio/wav;base64,${audioBase64}`);
        
        // Set up event handlers
        this.currentAudio.onended = () => {
            console.log('AudioManager: Audio chunk ended');
            this.isStreamPlaying = false;
            this.currentAudio = null; // Clear current audio instance
            this._playNextFromQueue(); // Play next chunk
        };

        this.currentAudio.onerror = (error) => {
            console.error('AudioManager: Error playing audio chunk:', error);
            this.isStreamPlaying = false;
            this.currentAudio = null; // Clear current audio instance
            // Try to play next chunk
            this._playNextFromQueue();
        };

        // Start playback
        this.currentAudio.play().catch(error => {
            console.error('AudioManager: Failed to play audio chunk:', error);
            this.isStreamPlaying = false;
            this.currentAudio = null; // Clear current audio instance
            this._playNextFromQueue();
        });
    }
}
