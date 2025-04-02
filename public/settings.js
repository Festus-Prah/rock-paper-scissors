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

    // --- Settings Panel Toggle ---
    settingsButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from immediately closing panel
        const isDisplayed = settingsPanel.style.display === 'block';
        settingsPanel.style.display = isDisplayed ? 'none' : 'block';
        settingsButton.style.transform = isDisplayed ? 'rotate(0deg)' : ''; // Reset rotation
        settingsButton.setAttribute('aria-expanded', !isDisplayed);
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
        if(backgroundSound) backgroundSound.volume = volumeSlider.value;
        soundToggle.checked = !savedMuted;
        if(backgroundSound) backgroundSound.muted = savedMuted;

        // Attempt to play only if not muted and element exists
        if (backgroundSound && !savedMuted && backgroundSound.paused) {
             backgroundSound.play().catch(e => console.log("Autoplay prevented initially:", e.message));
        } else if (backgroundSound && savedMuted && !backgroundSound.paused) {
            backgroundSound.pause();
        }
    };

    soundToggle.addEventListener('change', () => {
        if(!backgroundSound) return;
        const isMuted = !soundToggle.checked;
        backgroundSound.muted = isMuted;
         try { localStorage.setItem('soundMuted', isMuted); }
         catch(e) { console.warn("Could not save sound muted state:", e); }

        if (!isMuted && backgroundSound.paused) {
            backgroundSound.play().catch(e => console.log("Autoplay prevented on toggle:", e.message));
        } else if (isMuted && !backgroundSound.paused) {
            backgroundSound.pause();
        }
    });

    volumeSlider.addEventListener('input', () => {
        if(!backgroundSound) return;
        const volume = volumeSlider.value;
        backgroundSound.volume = volume;
        try { localStorage.setItem('soundVolume', volume); }
        catch(e) { console.warn("Could not save volume state:", e); }

        // If volume > 0 and was muted by toggle, unmuting via slider might be confusing.
        // Let's ensure the main toggle reflects the state if volume goes > 0
        if (volume > 0 && backgroundSound.muted && !soundToggle.checked) {
            // This case shouldn't happen if logic is right, but as a fallback:
            // soundToggle.checked = true; // Sync toggle if slider un-mutes
        }
        // Ensure music plays if volume is turned up from 0 and toggle is on
        if (volume > 0 && !backgroundSound.muted && soundToggle.checked && backgroundSound.paused){
             backgroundSound.play().catch(e => console.log("Autoplay prevented on volume up:", e.message));
        }
    });

    // Try to play on first interaction anywhere *if* sound should be on
    document.body.addEventListener('click', () => {
        if (backgroundSound && soundToggle.checked && backgroundSound.paused && !backgroundSound.muted) {
             backgroundSound.play().catch(e => {}); // Ignore errors here, it's opportunistic
        }
    }, { once: true });

    loadSoundSettings(); // Load settings on startup

    // --- Theme Selection ---
    themeSelect.addEventListener('change', () => {
        // applyTheme should be globally available from themes.js
        if (typeof applyTheme === 'function') {
            applyTheme(themeSelect.value);
        } else {
            console.error("applyTheme function not found.");
        }
    });
    // Initial theme application and dropdown sync is handled in themes.js

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
    if (onlineSection) {
         const initialMode = modeSelect.value; // Get value possibly set by game.js
         onlineSection.style.display = initialMode === 'online' ? 'block' : 'none';
    }


    // --- Online Play ---
    generateLinkButton.addEventListener('click', () => {
        generateLinkButton.textContent = 'Creating...';
        generateLinkButton.disabled = true;
        onlineLinkInput.value = ''; // Clear previous link
        copyLinkButton.textContent = 'Copy'; // Reset copy button

        fetch('/api/create-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' } // Good practice
            })
            .then(response => {
                if (!response.ok) {
                    // Try to parse error message from backend
                    return response.json().catch(() => ({ // If JSON parsing fails
                         error: `HTTP error! Status: ${response.status}`
                    })).then(err => Promise.reject(err));
                }
                return response.json();
            })
            .then(data => {
                if (!data.gameId || !data.link) {
                    throw new Error("Invalid response from server.");
                }
                console.log('Game created:', data);
                onlineLinkInput.value = data.link; // Display the full link
                 // Notify game.js to connect WebSocket and store ID
                 if (typeof handleGameCreated === 'function') {
                     handleGameCreated(data.gameId, data.link);
                 } else {
                     console.error("handleGameCreated function not found in game.js");
                 }
                generateLinkButton.textContent = 'Create Game Link';
                generateLinkButton.disabled = false;
            })
            .catch(error => {
                console.error('Error creating game:', error);
                 onlineLinkInput.value = ''; // Clear link on error
                 // Display error to user (e.g., in the result area)
                 const resultDiv = document.getElementById('result');
                 if(resultDiv) resultDiv.textContent = `Error: ${error.error || 'Could not create game'}`;
                 // Reset button
                generateLinkButton.textContent = 'Create Game Link';
                generateLinkButton.disabled = false;
            });
    });

    copyLinkButton.addEventListener('click', () => {
        if (!onlineLinkInput.value) return;

        onlineLinkInput.select(); // Select the text field content
        onlineLinkInput.setSelectionRange(0, 99999); // For mobile devices

        try {
             // Use modern Clipboard API
             navigator.clipboard.writeText(onlineLinkInput.value)
                 .then(() => {
                     copyLinkButton.textContent = 'Copied!';
                     setTimeout(() => copyLinkButton.textContent = 'Copy', 1500);
                 })
                 .catch(err => {
                     console.error('Async clipboard write failed: ', err);
                     // Fallback for older browsers or if Clipboard API fails
                     try {
                         const successful = document.execCommand('copy');
                         if (successful) {
                             copyLinkButton.textContent = 'Copied! (Fallback)';
                             setTimeout(() => copyLinkButton.textContent = 'Copy', 1500);
                         } else {
                              throw new Error('Fallback copy failed');
                         }
                     } catch (fallbackErr) {
                          console.error('Fallback execCommand copy failed:', fallbackErr);
                          alert('Failed to copy link automatically. Please copy manually.');
                          copyLinkButton.textContent = 'Copy';
                     }
                 });
        } catch (err) {
             console.error('Clipboard API not available or error:', err);
             alert('Copying failed. Please copy manually.');
             copyLinkButton.textContent = 'Copy';
        }
    });

    // --- Close settings panel when clicking outside ---
    document.addEventListener('click', (e) => {
        // Check if panel is block, click is outside panel AND not on the button itself
        if (settingsPanel.style.display === 'block' &&
            !settingsPanel.contains(e.target) &&
            !settingsButton.contains(e.target))
        {
            settingsPanel.style.display = 'none';
            settingsButton.style.transform = 'rotate(0deg)'; // Reset icon rotation
            settingsButton.setAttribute('aria-expanded', 'false');
        }
    });

});