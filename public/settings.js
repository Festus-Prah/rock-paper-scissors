// settings.js
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM Elements
    const settingsPanel = document.getElementById('settings-panel');
    const settingsButton = document.getElementById('settings-button');
    const soundToggle = document.getElementById('sound-toggle');
    const volumeSlider = document.getElementById('volume-slider');
    const backgroundSound = document.getElementById('background-sound');
    const themeSelect = document.getElementById('theme-select');
    const modeSelect = document.getElementById('mode-select');
    const generateLinkButton = document.getElementById('generate-link-button');
    const onlineLinkInput = document.getElementById('online-link');
    const copyLinkButton = document.getElementById('copy-link-button');
    const onlineSection = document.querySelector('.online-section'); // Cache section

    // Check if elements exist before adding listeners
    if (!settingsPanel || !settingsButton || !soundToggle || !volumeSlider || !themeSelect || !modeSelect || !generateLinkButton || !onlineLinkInput || !copyLinkButton || !onlineSection) {
        console.error("One or more settings elements not found in the DOM.");
        return; // Stop execution if critical elements are missing
    }

    // --- Settings Panel Toggle ---
    settingsButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from immediately closing panel
        const isDisplayed = settingsPanel.style.display === 'block';
        settingsPanel.style.display = isDisplayed ? 'none' : 'block';
        settingsButton.style.transform = isDisplayed ? '' : 'rotate(90deg)'; // Rotate icon when opening
        settingsButton.setAttribute('aria-expanded', String(!isDisplayed)); // Use string 'true'/'false'
    });

    // --- Sound Controls ---
    const loadSoundSettings = () => {
        let savedVolume = 0.5; // Default volume
        let savedMuted = false; // Default not muted
        try {
            const storedVolume = localStorage.getItem('soundVolume');
            const storedMuted = localStorage.getItem('soundMuted');
            if (storedVolume !== null) savedVolume = parseFloat(storedVolume);
            if (storedMuted !== null) savedMuted = storedMuted === 'true';
        } catch(e) { console.warn("Could not load sound settings from localStorage:", e); }

        volumeSlider.value = savedVolume;
        if(backgroundSound) {
             backgroundSound.volume = savedVolume; // Apply volume first
             backgroundSound.muted = savedMuted; // Then apply mute state
             soundToggle.checked = !savedMuted; // Sync checkbox

             // Attempt to play only if not muted
             if (!savedMuted && backgroundSound.paused) {
                  // Needs user interaction first usually
                  // console.log("Audio ready to play on interaction.");
             } else if (savedMuted && !backgroundSound.paused) {
                 backgroundSound.pause();
             }
        } else {
            // Disable sound controls if audio element is missing
            soundToggle.disabled = true;
            volumeSlider.disabled = true;
            console.warn("Background audio element not found.");
        }
    };

    soundToggle.addEventListener('change', () => {
        if(!backgroundSound) return;
        const isMuted = !soundToggle.checked;
        backgroundSound.muted = isMuted;
         try { localStorage.setItem('soundMuted', String(isMuted)); } // Save as string
         catch(e) { console.warn("Could not save sound muted state:", e); }

        if (!isMuted && backgroundSound.paused) {
            // Attempt play, likely needs interaction but try anyway
            backgroundSound.play().catch(e => console.log("Autoplay prevented on toggle:", e.message));
        } else if (isMuted && !backgroundSound.paused) {
            backgroundSound.pause();
        }
    });

    volumeSlider.addEventListener('input', () => {
        if(!backgroundSound) return;
        const volume = parseFloat(volumeSlider.value); // Ensure it's a number
        backgroundSound.volume = volume;
        try { localStorage.setItem('soundVolume', String(volume)); } // Save as string
        catch(e) { console.warn("Could not save volume state:", e); }

        // Automatically unmute if volume is turned up and it was muted by slider (volume=0)
        if (volume > 0 && backgroundSound.muted && soundToggle.checked) {
            // If toggle is checked (meaning user wants sound) but it's muted (likely via slider), unmute it
            backgroundSound.muted = false;
        }

        // Ensure music plays if volume is turned up from 0 and toggle is on
        if (volume > 0 && !backgroundSound.muted && soundToggle.checked && backgroundSound.paused){
             backgroundSound.play().catch(e => console.log("Autoplay prevented on volume up:", e.message));
        }
    });

    // Try to play on first interaction anywhere *if* sound should be on
    // Use a flag to ensure this only runs once
    let firstInteraction = false;
    const playOnFirstInteraction = () => {
        if (!firstInteraction && backgroundSound && soundToggle.checked && backgroundSound.paused && !backgroundSound.muted) {
             backgroundSound.play().catch(e => {}); // Ignore errors here, it's opportunistic
             firstInteraction = true; // Prevent future attempts
             document.body.removeEventListener('click', playOnFirstInteraction); // Clean up listener
             document.body.removeEventListener('keypress', playOnFirstInteraction);
        }
    };
    document.body.addEventListener('click', playOnFirstInteraction);
    document.body.addEventListener('keypress', playOnFirstInteraction);


    loadSoundSettings(); // Load settings on startup

    // --- Theme Selection ---
    themeSelect.addEventListener('change', () => {
        // applyTheme should be globally available from theme.js
        if (typeof applyTheme === 'function') {
            applyTheme(themeSelect.value);
        } else {
            console.error("applyTheme function not found.");
        }
    });
    // Initial theme application and dropdown sync is handled in theme.js

    // --- Mode Selection ---
    modeSelect.addEventListener('change', () => {
        const selectedMode = modeSelect.value;
        // Call setGameMode in game.js if it exists
        if (typeof setGameMode === 'function') {
            setGameMode(selectedMode); // This now handles WS closing, localStorage, UI updates
        } else {
            console.error('setGameMode function not found. Ensure game.js is loaded correctly.');
        }
    });
    // Initial mode sync for the dropdown is handled in game.js DOMContentLoaded

    // Initial visibility of online section (sync with game.js initial mode)
    // Ensure modeSelect.value is read *after* game.js might have set it
     const initialMode = modeSelect.value;
     onlineSection.style.display = initialMode === 'online' ? 'block' : 'none';


    // --- Online Play ---
    generateLinkButton.addEventListener('click', () => {
        generateLinkButton.textContent = 'Creating...';
        generateLinkButton.disabled = true;
        onlineLinkInput.value = ''; // Clear previous link
        copyLinkButton.textContent = 'Copy'; // Reset copy button

        fetch('/api/create-game', { // Path matches server.js
                method: 'POST',
                // No body needed unless sending data
                // headers: { 'Content-Type': 'application/json' } // Only needed if sending JSON body
            })
            .then(response => {
                if (!response.ok) {
                    // Try to parse error message from backend
                    return response.json().catch(() => ({ // If JSON parsing fails
                         error: `Could not create game. Server responded with status: ${response.status}`
                    })).then(err => Promise.reject(err)); // Reject with parsed or generated error
                }
                return response.json(); // Parse successful JSON response
            })
            .then(data => {
                if (!data.gameId || !data.link) {
                    throw new Error("Invalid response received from server.");
                }
                console.log('Game created:', data);
                onlineLinkInput.value = data.link; // Display the full link
                 // Notify game.js to connect WebSocket and store ID
                 if (typeof handleGameCreated === 'function') {
                     handleGameCreated(data.gameId, data.link);
                 } else {
                     console.error("handleGameCreated function not found in game.js");
                 }
            })
            .catch(error => {
                console.error('Error creating game:', error);
                 onlineLinkInput.value = ''; // Clear link on error
                 // Display error to user (e.g., in the result area)
                 const resultDiv = document.getElementById('result');
                 // Use error.error if available from parsed JSON, otherwise use default message
                 if(resultDiv) resultDiv.textContent = `Error: ${error.error || error.message || 'Could not create game'}`;
            })
            .finally(() => {
                 // Reset button state regardless of success or failure
                generateLinkButton.textContent = 'Create Game Link';
                generateLinkButton.disabled = false;
            });
    });

    copyLinkButton.addEventListener('click', () => {
        if (!onlineLinkInput.value) return;

        onlineLinkInput.select(); // Select the text field content
        onlineLinkInput.setSelectionRange(0, 99999); // For mobile devices

        let copySuccess = false;
        try {
            // Use modern Clipboard API if available (preferred)
             if (navigator.clipboard && navigator.clipboard.writeText) {
                 navigator.clipboard.writeText(onlineLinkInput.value)
                     .then(() => {
                         copySuccess = true;
                         copyLinkButton.textContent = 'Copied!';
                         setTimeout(() => copyLinkButton.textContent = 'Copy', 1500);
                     })
                     .catch(err => {
                         console.error('Async clipboard write failed: ', err);
                         tryCopyExecCommand(); // Try fallback on failure
                     });
             } else {
                 tryCopyExecCommand(); // Use fallback if API not present
             }
        } catch (err) {
             console.error('Clipboard API error:', err);
             tryCopyExecCommand(); // Try fallback on error
        }

        function tryCopyExecCommand() {
            try {
                 const successful = document.execCommand('copy');
                 if (successful) {
                     copySuccess = true;
                     copyLinkButton.textContent = 'Copied! (Fallback)';
                     setTimeout(() => copyLinkButton.textContent = 'Copy', 1500);
                 } else {
                      throw new Error('Fallback copy command failed');
                 }
            } catch (fallbackErr) {
                 console.error('Fallback execCommand copy failed:', fallbackErr);
                 alert('Failed to copy link automatically. Please select the link and copy it manually.');
                 copyLinkButton.textContent = 'Copy'; // Reset button text
            }
        }
    });

    // --- Close settings panel when clicking outside ---
    document.addEventListener('click', (e) => {
        // Check if panel is displayed, click is outside panel AND not on the button itself
        if (settingsPanel.style.display === 'block' &&
            !settingsPanel.contains(e.target) &&
            !settingsButton.contains(e.target))
        {
            settingsPanel.style.display = 'none';
            settingsButton.style.transform = ''; // Reset icon rotation
            settingsButton.setAttribute('aria-expanded', 'false');
        }
    });

});