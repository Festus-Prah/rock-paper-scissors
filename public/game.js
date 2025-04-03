// game.js

// --- Global Game State Variables ---
let player1Score = 0;
let player2Score = 0;
let mode = 'computer'; // Default mode, overridden by settings.js/URL/localStorage
let player1ChoiceLocal = null; // For 'friend' mode tracking
let ws = null; // WebSocket connection for 'online' mode
let currentOnlineGameId = null; // Store the active game ID
let playerUsername = 'Guest'; // Store the username fetched from server
let gameActive = true; // Flag to prevent clicks during processing

// --- Constants ---
const options = ['rock', 'paper', 'scissors'];
const optionsDisplay = { 'rock': '🧱', 'paper': '🧻', 'scissors': '✂️' };

// --- DOM Elements (cached for performance) ---
let choicesDiv, resultDiv, player1ScoreSpan, player2ScoreSpan, p1ChoiceDiv, p2ChoiceDiv, opponentLabel, usernameSpan, resetButtonElement, choiceButtons;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM elements
    choicesDiv = document.getElementById('choices');
    resultDiv = document.getElementById('result');
    player1ScoreSpan = document.getElementById('player1-score');
    player2ScoreSpan = document.getElementById('player2-score');
    p1ChoiceDiv = document.getElementById('player1-choice');
    p2ChoiceDiv = document.getElementById('player2-choice');
    opponentLabel = document.getElementById('opponent-label');
    usernameSpan = document.getElementById('username');
    resetButtonElement = document.getElementById('reset-button');
    choiceButtons = document.querySelectorAll('.choice'); // Cache buttons

    // Add event listeners for choices
    choiceButtons.forEach(choiceElement => {
        choiceElement.addEventListener('click', () => {
            if (!gameActive) return; // Prevent clicking if game is inactive
            const choice = choiceElement.getAttribute('data-choice');
            makeChoice(choice);
        });
    });

    // Add event listener for reset button
    resetButtonElement.addEventListener('click', resetGame);

    // Fetch username from server API
    fetch('/api/username')
        .then(response => {
            if (!response.ok) { // Check for non-2xx status codes
                return response.text().then(text => Promise.reject(`HTTP error ${response.status}: ${text}`));
            }
            return response.json();
        })
        .then(data => {
            playerUsername = data.username || 'Guest';
            usernameSpan.textContent = playerUsername;
            console.log('Username set to:', playerUsername);
        })
        .catch(error => {
            console.error('Error fetching username:', error);
            usernameSpan.textContent = 'Guest (Error)'; // Indicate error
        });

    // Determine initial mode (URL > localStorage > default)
    const pathParts = window.location.pathname.split('/');
    // Expecting /game/<gameId>
    const gameIdFromUrl = (pathParts.length === 3 && pathParts[1] === 'game' && /^[a-f0-9]{8}$/i.test(pathParts[2]))
                          ? pathParts[2]
                          : null;

    let initialMode = 'computer'; // Default
    try {
        const savedMode = localStorage.getItem('gameMode');
        if (savedMode && ['computer', 'friend', 'online'].includes(savedMode)) {
             initialMode = savedMode;
        }
    } catch(e) { console.warn("Could not read mode from localStorage:", e); }

    if (gameIdFromUrl) {
        initialMode = 'online'; // Prioritize joining via URL
        console.log(`Found game ID in URL: ${gameIdFromUrl}. Setting mode to online.`);
        // Connection attempt will be triggered by setGameMode or called below
    }

    // Apply the determined mode (this also updates UI and saves preference)
    // Ensure setGameMode is defined globally or hoisted correctly
    setGameMode(initialMode);

    // If joining via URL, attempt connection immediately *after* setting mode
    if (gameIdFromUrl && initialMode === 'online') {
        connectWebSocket(gameIdFromUrl);
    }

    // Sync the mode selector dropdown in settings
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
        modeSelect.value = initialMode;
    }

    resultDiv.textContent = 'Select your mode and make a choice!';
});

// --- Core Game Functions ---

function makeChoice(choice) {
    if (!gameActive) {
        console.log("Ignoring choice, game not active.");
        return;
    }

    // Visual feedback for selection
    const choiceEl = document.querySelector(`.choice[data-choice="${choice}"]`);
    if (choiceEl) {
        choiceEl.classList.add('selected');
        // Remove the class slightly later to ensure visibility
        setTimeout(() => {
            if (choiceEl) choiceEl.classList.remove('selected');
         }, 350); // Slightly longer than animation time
    }

    // Delegate based on mode
    if (mode === 'computer') playAgainstComputer(choice);
    else if (mode === 'friend') playAgainstFriend(choice);
    else if (mode === 'online') playOnline(choice);
    else {
        resultDiv.textContent = 'Please select a valid game mode first!';
    }
}

function playAgainstComputer(playerChoice) {
    setGameActive(false); // Disable choices during computer's "thinking" and reveal
    const computerChoice = options[Math.floor(Math.random() * options.length)];

    displayChoicesWithAnimation(playerChoice, computerChoice, () => {
        determineWinner(playerChoice, computerChoice);
        setTimeout(() => {
            resetChoiceDisplay();
            setGameActive(true);
            resultDiv.textContent = 'Make your choice!';
        }, 1500); // Delay before next round prompt
    });
}

function playAgainstFriend(choice) {
    if (!player1ChoiceLocal) {
        // Player 1's turn
        player1ChoiceLocal = choice;
        resultDiv.textContent = 'Player 1 chose. Player 2, your turn!';
        p1ChoiceDiv.textContent = '✔️'; // Indicate P1 chose
        p2ChoiceDiv.textContent = '?';
    } else {
        // Player 2's turn - Reveal and determine winner
        setGameActive(false); // Disable choices during reveal
        const player2Choice = choice;
        resultDiv.textContent = 'Revealing choices...';

        displayChoicesWithAnimation(player1ChoiceLocal, player2Choice, () => {
             determineWinner(player1ChoiceLocal, player2Choice);
             player1ChoiceLocal = null; // Reset for next round
             // Re-enable choices after a delay
             setTimeout(() => {
                 resetChoiceDisplay();
                 setGameActive(true);
                 resultDiv.textContent = 'Player 1, make your choice!';
              }, 1500);
         });
    }
}

function playOnline(choice) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        resultDiv.textContent = 'Not connected to online game. Create/Join a game first.';
        console.warn("Attempted to play online without open WebSocket. State:", ws ? ws.readyState : 'null');
        setGameActive(true); // Re-enable if not connected
        return;
    }
    if (!currentOnlineGameId) {
         resultDiv.textContent = 'Error: No active game ID found.';
         console.error("No currentOnlineGameId set for playOnline");
         setGameActive(true); // Re-enable on error
         return;
    }

    console.log(`Sending choice: ${choice} for game: ${currentOnlineGameId}`);
    setGameActive(false); // Disable choices until result comes back
    try {
        ws.send(JSON.stringify({ choice: choice })); // Server knows gameId from ws context
        resultDiv.textContent = 'Choice sent. Waiting for opponent...';
        p1ChoiceDiv.textContent = optionsDisplay[choice]; // Show own choice immediately
        p2ChoiceDiv.textContent = '⏳'; // Indicate waiting
    } catch (error) {
        console.error("Error sending choice via WebSocket:", error);
        resultDiv.textContent = 'Error sending choice. Connection issue?';
        setGameActive(true); // Re-enable on send error
    }
}

function displayChoicesWithAnimation(p1Choice, p2Choice, callback) {
    // Ensure elements exist
    if (!p1ChoiceDiv || !p2ChoiceDiv) return;

    // Start fade out immediately
    p1ChoiceDiv.style.opacity = '0';
    p1ChoiceDiv.style.transform = 'scale(0.8)';
    p2ChoiceDiv.style.opacity = '0';
    p2ChoiceDiv.style.transform = 'scale(0.8)';

    // Clear previous winner states before updating text
    p1ChoiceDiv.classList.remove('winner');
    p2ChoiceDiv.classList.remove('winner');

    setTimeout(() => {
        // Update text content after fade out starts
        p1ChoiceDiv.textContent = optionsDisplay[p1Choice] || '?';
        p2ChoiceDiv.textContent = optionsDisplay[p2Choice] || '?';

        // Start fade in
        p1ChoiceDiv.style.opacity = '1';
        p1ChoiceDiv.style.transform = 'scale(1)';
        p2ChoiceDiv.style.opacity = '1';
        p2ChoiceDiv.style.transform = 'scale(1)';

        // Execute callback after animation starts
        if (callback) callback();
    }, 150); // Duration should match transition time or be slightly less
}


function determineWinner(myChoice, opponentChoice) {
     // Ensure elements exist
     if (!resultDiv || !player1ScoreSpan || !player2ScoreSpan || !p1ChoiceDiv || !p2ChoiceDiv || !opponentLabel) return;

    let resultText = '';
    let iWin = false;
    let opponentWins = false;
    const opponentName = opponentLabel.textContent; // Get current opponent name

    // Clear previous winner states immediately for responsiveness
    p1ChoiceDiv.classList.remove('winner');
    p2ChoiceDiv.classList.remove('winner');


    if (!myChoice || !opponentChoice) {
        console.warn("Cannot determine winner, choices missing:", myChoice, opponentChoice);
        resultDiv.textContent = "Error determining result.";
         setGameActive(true); // Re-enable game if determination fails
        return;
    }

    if (myChoice === opponentChoice) {
        resultText = `Tie! Both chose ${optionsDisplay[myChoice]}.`;
    } else if (
        (myChoice === 'rock' && opponentChoice === 'scissors') ||
        (myChoice === 'paper' && opponentChoice === 'rock') ||
        (myChoice === 'scissors' && opponentChoice === 'paper')
    ) {
        resultText = (mode === 'friend' ? 'Player 1 wins!' : 'You win!') + ` ${optionsDisplay[myChoice]} beats ${optionsDisplay[opponentChoice]}.`;
        player1Score++;
        iWin = true;
    } else {
        resultText = `${opponentName} wins! ${optionsDisplay[opponentChoice]} beats ${optionsDisplay[myChoice]}.`;
        player2Score++;
        opponentWins = true;
    }

    resultDiv.textContent = resultText;
    player1ScoreSpan.textContent = player1Score;
    player2ScoreSpan.textContent = player2Score;

    // Apply winner pulse animation using toggle's boolean argument
    p1ChoiceDiv.classList.toggle('winner', iWin);
    p2ChoiceDiv.classList.toggle('winner', opponentWins);

    // Re-enabling game for next round is handled by callers (playAgainstComputer/Friend timeouts or WS message handler)
}

function resetGame() {
     // Ensure elements exist
     if (!player1ScoreSpan || !player2ScoreSpan || !resultDiv || !p1ChoiceDiv || !p2ChoiceDiv) return;

    player1Score = 0;
    player2Score = 0;
    player1ChoiceLocal = null; // Reset local friend mode choice
    player1ScoreSpan.textContent = '0';
    player2ScoreSpan.textContent = '0';
    resultDiv.textContent = 'Make your choice!';
    resetChoiceDisplay();
    setGameActive(true); // Ensure game is active after reset
    console.log("Game score reset.");
    // Note: Does NOT disconnect WebSocket, that's handled by mode change/close
}

// Resets the choice display divs to '?'
function resetChoiceDisplay() {
     // Ensure elements exist
     if (!p1ChoiceDiv || !p2ChoiceDiv) return;

    p1ChoiceDiv.classList.remove('winner');
    p2ChoiceDiv.classList.remove('winner');
    // Only reset to '?' if not actively waiting for an online opponent's choice
    if (p1ChoiceDiv.textContent !== '⏳' && p2ChoiceDiv.textContent !== '⏳') {
        p1ChoiceDiv.style.opacity = '0';
        p2ChoiceDiv.style.opacity = '0';
        setTimeout(() => {
            p1ChoiceDiv.textContent = '?';
            p2ChoiceDiv.textContent = '?';
             p1ChoiceDiv.style.opacity = '1';
             p2ChoiceDiv.style.opacity = '1';
             p1ChoiceDiv.style.transform = 'scale(1)'; // Reset scale if needed
             p2ChoiceDiv.style.transform = 'scale(1)';
         }, 150);
     }
 }


function setGameActive(isActive) {
     // Ensure element exists
     if (!choicesDiv) return;
    gameActive = isActive;
    choicesDiv.classList.toggle('disabled', !isActive);
}

function updateOpponentLabel() {
     if (!opponentLabel) return; // Guard against early calls
     let label = 'Opponent';
     switch(mode) {
         case 'computer': label = 'Computer'; break;
         case 'friend': label = 'Player 2'; break;
         case 'online': label = 'Online Opponent'; break;
     }
     opponentLabel.textContent = label;
}

// --- WebSocket Functions (for Online Mode) ---

function connectWebSocket(gameId) {
     // Ensure element exists
     if (!resultDiv) return;

    if (!gameId) {
        console.error("connectWebSocket called without gameId.");
        resultDiv.textContent = "Invalid game ID.";
        return;
    }

    // Close existing connection if connecting to a different game or if it's not open/connecting
    if (ws && (currentOnlineGameId !== gameId || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING))) {
        console.log(`Closing old WebSocket connection (State: ${ws.readyState}, Current Game: ${currentOnlineGameId}, Target Game: ${gameId})`);
        ws.close(1000, currentOnlineGameId !== gameId ? "Connecting to a different game" : "Reconnecting");
        ws = null; // Ensure ws is nullified immediately
    } else if (ws && ws.readyState === WebSocket.OPEN && currentOnlineGameId === gameId) {
        console.log(`Already connected to WebSocket for game: ${gameId}`);
        resultDiv.textContent = 'Already connected. Waiting for opponent...';
        return; // Already correctly connected
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.log("WebSocket is already attempting to connect. Please wait.");
        return; // Don't create a new one while connecting
    }

    // Proceed with new connection
    currentOnlineGameId = gameId; // Set the active game ID *before* connecting
    console.log(`Attempting to connect WebSocket for game: ${gameId}`);
    resultDiv.textContent = `Connecting to game ${gameId}...`;
    setGameActive(false); // Disable choices while connecting

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Use location.host which includes port if non-standard
    const wsUrl = `${protocol}://${window.location.host}/ws/${gameId}`; // Path matches server setup

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log(`WebSocket connected to ${wsUrl}`);
            resultDiv.textContent = 'Connected! Waiting for opponent...';
            // Game activity might be set by messages received (e.g., player count)
            // setGameActive(true); // Enable choices now that we are connected - let server confirm
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("WebSocket message received:", data);

                if (data.error) {
                    console.error('WebSocket error message:', data.error);
                    resultDiv.textContent = `Error: ${data.error}`;
                    setGameActive(true); // Re-enable choices on error? Maybe not always safe.
                    if (data.error.includes("full") || data.error.includes("not found") || data.error.includes("ended")) {
                        ws.close(1000, "Game error received");
                        currentOnlineGameId = null; // Clear game ID on fatal error
                    }
                } else if (data.playerCount) {
                    resultDiv.textContent = `Players: ${data.playerCount}/2. `;
                    if (data.playerCount === 2) {
                         resultDiv.textContent += "Make your choice!";
                         setGameActive(true); // Ensure game is active
                         resetChoiceDisplay(); // Reset display for new round/game start
                    } else {
                         resultDiv.textContent += "Waiting for opponent...";
                         setGameActive(false); // Disable game until opponent joins
                         resetChoiceDisplay(); // Show '?' while waiting
                    }
                } else if (data.yourChoice && data.opponentChoice) {
                    // Received results from server for the round
                    console.log(`Received results - My choice: ${data.yourChoice}, Opponent's: ${data.opponentChoice}`);
                    // Display choices first, then determine winner which handles UI update delays
                    displayChoicesWithAnimation(data.yourChoice, data.opponentChoice, () => {
                        determineWinner(data.yourChoice, data.opponentChoice);
                        // Re-enable game *after* result is shown and animation potentially finished
                        setTimeout(() => {
                             resultDiv.textContent = "Round finished! Make your next choice.";
                             resetChoiceDisplay(); // Prepare for next round visually
                             setGameActive(true); // Re-enable for next round
                         }, 1500);
                     });
                    player1ChoiceLocal = null; // Clear local state if any
                } else if (data.message) { // General status messages
                     resultDiv.textContent = data.message;

                     // Notify user if the opponent has made their first move
                     if (data.message.toLowerCase().includes("opponent has made their first move")) {
                         console.log("Opponent has made their first move.");
                     }

                     // Check if message implies choices should be active
                     if (data.message.toLowerCase().includes("make your choice")) {
                          setGameActive(true);
                          resetChoiceDisplay();
                     } else if (data.message.toLowerCase().includes("waiting")) {
                          setGameActive(false);
                          resetChoiceDisplay();
                     }
                }

            } catch (e) {
                console.error("Error parsing WebSocket message:", event.data, e);
                resultDiv.textContent = 'Error processing game data.';
                setGameActive(true); // Re-enable choices on error
            }
        };

        ws.onerror = (error) => {
            // Log the error object itself for more details if available
            console.error('WebSocket error event:', error);
            resultDiv.textContent = 'Connection error. Please refresh or try joining again.';
            setGameActive(true); // Re-enable choices
            ws = null; // Clear the ws variable
            currentOnlineGameId = null;
        };

        ws.onclose = (event) => {
            // Use event.reason, converting Buffer to string if necessary
            const reason = event.reason instanceof Buffer ? event.reason.toString() : (event.reason || 'No reason specified');
            console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${reason}`);

             // Only show generic disconnection messages if it wasn't an intentional close or known error
             if (event.code !== 1000 /* Normal Closure */ &&
                 event.code !== 1012 /* Service Restart */ &&
                 reason !== "Connecting to a different game" &&
                 reason !== "User changed game mode" &&
                 reason !== "Game error received")
             {
                 resultDiv.textContent = `Connection lost (Code: ${event.code}). Please refresh or rejoin.`;
             } else if (reason && reason !== "User changed game mode" && !reason.includes("Game error received")){
                 // Show specific reason if provided and not handled above
                 resultDiv.textContent = `Disconnected: ${reason}`;
             } else if (mode === 'online' && reason !== "User changed game mode" && ws) {
                  // If still in online mode and not intentionally closed, show generic disconnected
                  // Check 'ws' to ensure this isn't firing after intentional nullification
                  resultDiv.textContent = 'Disconnected from game.';
             }

            setGameActive(true); // Ensure game is playable in other modes
            ws = null; // Clear the ws variable
            currentOnlineGameId = null;
            // Reset score etc. only if disconnection wasn't planned (like changing mode)
            if (reason !== "Connecting to a different game" && reason !== "User changed game mode") {
                 resetGame(); // Reset scores etc. if connection dropped unexpectedly
                 updateOpponentLabel(); // Ensure label is correct
             }
        };

    } catch (error) {
        console.error("Failed to create WebSocket:", error);
        resultDiv.textContent = "Could not initiate connection.";
        setGameActive(true); // Allow other modes
        ws = null;
        currentOnlineGameId = null;
    }
}

// --- Functions accessible by settings.js ---

// Exposed globally for settings.js to call
function setGameMode(newMode) {
    if (!['computer', 'friend', 'online'].includes(newMode)) {
        console.error("Invalid mode selected:", newMode);
        return;
    }

    // Close WS only if currently connected in online mode and switching away
    if (mode === 'online' && newMode !== 'online' && ws && ws.readyState === WebSocket.OPEN) {
        console.log("Closing WebSocket connection due to mode change from Online.");
        ws.close(1000, "User changed game mode"); // Normal closure with reason
        ws = null; // Nullify immediately
        currentOnlineGameId = null;
    }

    mode = newMode; // Set the new mode

    // Save preference to localStorage
    try {
        localStorage.setItem('gameMode', mode);
    } catch(e) { console.warn("Could not save mode to localStorage:", e); }

    player1ChoiceLocal = null; // Reset friend mode state
    updateOpponentLabel();
    resetGame(); // Reset scores and UI text for the new mode
    setGameActive(true); // Ensure game is active for the new mode
    // Set appropriate initial message based on mode
    if (mode === 'online') {
         resultDiv.textContent = 'Select "Create Game Link" or join via a link!';
         setGameActive(false); // Don't allow choices until connected/game starts
    } else {
        resultDiv.textContent = 'Make your choice!';
    }
    console.log("Game mode set to:", mode);

    // Update visibility of online section in settings panel
    const onlineSection = document.querySelector('#settings-panel .online-section');
    if (onlineSection) {
        onlineSection.style.display = newMode === 'online' ? 'block' : 'none';
    }
}

// Exposed globally for settings.js to call after creating a game
function handleGameCreated(gameId, link) {
    if (mode !== 'online') {
        console.warn("handleGameCreated called but mode is not online. Switching.");
        setGameMode('online'); // Ensure mode is online
    }
    currentOnlineGameId = gameId;
    // settings.js handles updating the input field
    // Automatically connect the creator to the WebSocket
    connectWebSocket(gameId);
}