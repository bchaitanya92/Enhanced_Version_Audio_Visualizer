// Enhanced Audio Visualizer JavaScript

document.addEventListener('DOMContentLoaded', () => {
    // Global variables
    let audioContext;
    let analyser;
    let source;
    let animationId;

    // --- DOM Elements ---
    const canvas = document.getElementById('canvas');
    const canvasContext = canvas.getContext('2d');
    const audioInput = document.getElementById('audio');
    const fileInputButton = document.querySelector('.file-input-button'); // Get the button
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const fftSizeSelect = document.getElementById('fftSize');
    const smoothingSlider = document.getElementById('smoothing');
    const colorModeSelect = document.getElementById('colorMode');
    const sensitivitySlider = document.getElementById('sensitivity');
    const smoothingValue = document.getElementById('smoothingValue');
    const sensitivityValue = document.getElementById('sensitivityValue');
    const audioInfo = document.getElementById('audioInfo');
    const audioTitle = document.getElementById('audioTitle');
    const audioDuration = document.getElementById('audioDuration');
    const loading = document.getElementById('loading');

    // --- Configuration ---
    let config = {
        fftSize: 256,
        smoothingTimeConstant: 0.8,
        colorMode: 'spectrum',
        sensitivity: 1.0
    };

    // Color themes mapping
    const colorThemes = {
        spectrum: (freq, i, total) => `hsl(${(i / total) * 360}, 100%, ${50 + freq / 255 * 25}%)`,
        rainbow: (freq, i, total) => `hsl(${(i / total) * 360 + Date.now() * 0.1 % 360}, 80%, ${40 + freq / 255 * 30}%)`,
        fire: (freq) => `rgb(255, ${Math.min(255, freq * 0.7)}, 0)`,
        ocean: (freq) => `rgb(0, ${100 + freq * 0.5}, ${150 + freq * 0.4})`,
        neon: (freq, i, total) => {
            const colors = ['#ff0080', '#00ff80', '#8000ff', '#ff8000', '#0080ff'];
            const color = colors[Math.floor((i / total) * colors.length)];
            return `${color}${Math.floor(freq / 255 * 255).toString(16).padStart(2, '0')}`;
        },
        monochrome: (freq) => `rgb(${freq}, ${freq}, ${freq})`
    };

    // --- Core Functions ---

    // Initialize or resize the canvas
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvasContext.scale(dpr, dpr);
        if (!audioContext || audioContext.state !== 'running') {
            drawPlaceholder();
        }
    }

    // Draw placeholder text when no audio is playing
    function drawPlaceholder() {
        const rect = canvas.getBoundingClientRect();
        const gradient = canvasContext.createLinearGradient(0, 0, 0, rect.height);
        gradient.addColorStop(0, 'rgba(12, 12, 12, 0.8)');
        gradient.addColorStop(1, 'rgba(45, 27, 105, 0.8)');
        canvasContext.fillStyle = gradient;
        canvasContext.fillRect(0, 0, rect.width, rect.height);
        
        canvasContext.fillStyle = 'rgba(255, 255, 255, 0.5)';
        canvasContext.font = `bold ${Math.min(24, rect.width / 25)}px Inter, sans-serif`;
        canvasContext.textAlign = 'center';
        canvasContext.fillText('Upload an audio file to begin', rect.width / 2, rect.height / 2);
    }
    
    // Toggle Play/Pause state
    function togglePlayPause() {
        if (!audioContext) return;
        if (audioContext.state === 'running') {
            audioContext.suspend();
        } else if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    // Main file upload handler
    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            alert('Please select a valid audio file.');
            return;
        }

        showLoading(true);
        updateAudioInfo(file.name, 'Loading...');
        playPauseBtn.disabled = true;

        try {
            const arrayBuffer = await file.arrayBuffer();
            await setupAudio(arrayBuffer, file.name);
        } catch (error) {
            console.error('Error processing audio file:', error);
            updateAudioInfo('Error loading file', 'Please try a different one.');
            drawPlaceholder();
        } finally {
            showLoading(false);
        }
    }

    // Setup audio context and nodes
    async function setupAudio(arrayBuffer, fileName) {
        if (audioContext) {
            await audioContext.close();
        }
        if (animationId) {
            cancelAnimationFrame(animationId);
        }

        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        audioContext.onstatechange = () => {
            const isRunning = audioContext.state === 'running';
            playPauseBtn.setAttribute('aria-label', isRunning ? 'Pause' : 'Play');
            playIcon.style.display = isRunning ? 'none' : 'block';
            pauseIcon.style.display = isRunning ? 'block' : 'none';
        };

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        analyser = audioContext.createAnalyser();
        analyser.fftSize = config.fftSize;
        analyser.smoothingTimeConstant = config.smoothingTimeConstant;

        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser).connect(audioContext.destination);

        source.onended = () => {
            cancelAnimationFrame(animationId);
            playPauseBtn.disabled = true;
            audioContext.onstatechange(); // Update UI to show play icon
            updateAudioInfo('Playback finished', 'Upload another file to continue.');
            drawPlaceholder();
        };

        source.start(0);
        playPauseBtn.disabled = false;
        audioContext.onstatechange();

        const duration = audioBuffer.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
        updateAudioInfo(fileName, `Duration: ${minutes}:${seconds}`);
        
        startVisualization();
    }

    // Visualization loop
    function startVisualization() {
        const frequencyBufferLength = analyser.frequencyBinCount;
        const frequencyData = new Uint8Array(frequencyBufferLength);

        const draw = () => {
            animationId = requestAnimationFrame(draw);

            const rect = canvas.getBoundingClientRect();
            const barWidth = rect.width / frequencyBufferLength;

            // Background
            const gradient = canvasContext.createLinearGradient(0, 0, 0, rect.height);
            gradient.addColorStop(0, 'rgba(12, 12, 12, 0.1)');
            gradient.addColorStop(1, 'rgba(45, 27, 105, 0.1)');
            canvasContext.fillStyle = gradient;
            canvasContext.fillRect(0, 0, rect.width, rect.height);
            
            analyser.getByteFrequencyData(frequencyData);

            // Draw bars
            for (let i = 0; i < frequencyBufferLength; i++) {
                const freq = frequencyData[i] * config.sensitivity;
                const barHeight = (freq / 255) * rect.height * 0.8;
                const color = colorThemes[config.colorMode](freq, i, frequencyBufferLength);
                
                canvasContext.fillStyle = color;
                canvasContext.fillRect(i * barWidth, rect.height - barHeight, barWidth - 1, barHeight);

                // Add glow for louder sounds
                if (freq > 150) {
                    canvasContext.shadowColor = color;
                    canvasContext.shadowBlur = Math.min(20, freq / 10);
                    canvasContext.fillRect(i * barWidth, rect.height - barHeight, barWidth - 1, barHeight);
                    canvasContext.shadowBlur = 0;
                }
            }
        };
        draw();
    }

    // --- UI & Utility Functions ---
    function showLoading(show) {
        loading.classList.toggle('visible', show);
    }

    function updateAudioInfo(title, duration) {
        audioTitle.textContent = title;
        audioDuration.textContent = duration;
        audioInfo.style.display = 'block';
    }

    function resetSettings() {
        config = { fftSize: 256, smoothingTimeConstant: 0.8, colorMode: 'spectrum', sensitivity: 1.0 };
        fftSizeSelect.value = '256';
        smoothingSlider.value = '0.8';
        smoothingValue.textContent = '0.8';
        colorModeSelect.value = 'spectrum';
        sensitivitySlider.value = '1.0';
        sensitivityValue.textContent = '1.0';
        
        if (analyser) {
            analyser.fftSize = config.fftSize;
            analyser.smoothingTimeConstant = config.smoothingTimeConstant;
        }
    }

    // --- Event Listeners ---
    window.addEventListener('resize', resizeCanvas);
    
    // -- THIS IS THE FIX for the upload button --
    fileInputButton.addEventListener('click', () => {
        audioInput.click(); 
    });

    audioInput.addEventListener('change', handleFileUpload);
    playPauseBtn.addEventListener('click', togglePlayPause);

    fftSizeSelect.addEventListener('change', (e) => {
        config.fftSize = parseInt(e.target.value, 10);
        if (analyser) analyser.fftSize = config.fftSize;
    });

    smoothingSlider.addEventListener('input', (e) => {
        config.smoothingTimeConstant = parseFloat(e.target.value);
        smoothingValue.textContent = e.target.value;
        if (analyser) analyser.smoothingTimeConstant = config.smoothingTimeConstant;
    });

    colorModeSelect.addEventListener('change', (e) => config.colorMode = e.target.value);
    sensitivitySlider.addEventListener('input', (e) => {
        config.sensitivity = parseFloat(e.target.value);
        sensitivityValue.textContent = e.target.value;
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.code === 'Space') {
            e.preventDefault();
            playPauseBtn.click();
        }
        if (e.code === 'KeyF') {
            e.preventDefault();
            if (!document.fullscreenElement) {
                canvas.parentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
        if (e.code === 'KeyR') {
            e.preventDefault();
            resetSettings();
        }
    });
    
    document.addEventListener('fullscreenchange', () => setTimeout(resizeCanvas, 100));
    
    // --- Initial State ---
    resizeCanvas();
});