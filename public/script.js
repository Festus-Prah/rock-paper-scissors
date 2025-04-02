let player1Score = 0;
let player2Score = 0;
let mode = null;
let player1Choice = null;
const options = ["rock", "paper", "scissors"];
const optionsDisplay = { "rock": "🧱", "paper": "🧻", "scissors": "✂️" };

// Sound settings
let soundSettings = {
    choice: true,
    win: true
};

// Initial state
document.getElementById('result').innerText = 'Select a mode to start!';

function toggleSettings() {
    const settingsPanel = document.getElementById('settings-panel');
    settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
}

function updateSoundSettings() {
    soundSettings.choice = document.getElementById('choice-sound-toggle').checked;
    soundSettings.win = document.getElementById('win-sound-toggle').checked;
}

function setMode(selectedMode) {
    mode = selectedMode;
    document.getElementById("opponent-label").innerText = mode === "computer" ? "Computer" : "Player 2";
    resetGame();
}

function makeChoice(choice) {
    if (!mode) {
        document.getElementById("result").innerText = "Please select a mode first!";
        return;
    }

    // Click animation
    const clickedElement = document.querySelector(`.choice[data-choice="${choice}"]`);
    clickedElement.classList.add('selected');
    setTimeout(() => clickedElement.classList.remove('selected'), 300);

    // Play choose sound if enabled
    if (soundSettings.choice) {
        const chooseSound = document.getElementById('choose-sound');
        chooseSound.pause();
        chooseSound.currentTime = 0;
        chooseSound.play();
    }

    if (mode === "computer") {
        playAgainstComputer(choice);
    } else {
        playAgainstFriend(choice);
    }
}

function playAgainstComputer(playerChoice) {
    const computerChoice = options[Math.floor(Math.random() * options.length)];
    const p1ChoiceEl = document.getElementById('player1-choice');
    const p2ChoiceEl = document.getElementById('player2-choice');

    p1ChoiceEl.style.transform = 'scale(0.5)';
    p1ChoiceEl.style.opacity = '0';
    p2ChoiceEl.style.transform = 'scale(0.5)';
    p2ChoiceEl.style.opacity = '0';

    setTimeout(() => {
        p1ChoiceEl.innerText = optionsDisplay[playerChoice];
        p2ChoiceEl.innerText = optionsDisplay[computerChoice];
        p1ChoiceEl.style.transform = 'scale(1)';
        p1ChoiceEl.style.opacity = '1';
        p2ChoiceEl.style.transform = 'scale(1)';
        p2ChoiceEl.style.opacity = '1';
        determineWinner(playerChoice, computerChoice, 'Computer');
    }, 10);
}

function playAgainstFriend(choice) {
    if (!player1Choice) {
        player1Choice = choice;
        document.getElementById('result').innerText = 'Player 1 has chosen. Player 2, make your choice!';
        document.getElementById('player1-choice').innerText = '❓';
    } else {
        disableChoices();
        const p1ChoiceEl = document.getElementById('player1-choice');
        const p2ChoiceEl = document.getElementById('player2-choice');
        p1ChoiceEl.classList.add('shaking');
        p2ChoiceEl.classList.add('shaking');
        document.getElementById('result').innerText = '3...';
        setTimeout(() => document.getElementById('result').innerText = '2...', 1000);
        setTimeout(() => document.getElementById('result').innerText = '1...', 2000);
        setTimeout(() => {
            p1ChoiceEl.classList.remove('shaking');
            p2ChoiceEl.classList.remove('shaking');
            p1ChoiceEl.style.transform = 'scale(0.5)';
            p1ChoiceEl.style.opacity = '0';
            p2ChoiceEl.style.transform = 'scale(0.5)';
            p2ChoiceEl.style.opacity = '0';
            setTimeout(() => {
                p1ChoiceEl.innerText = optionsDisplay[player1Choice];
                p2ChoiceEl.innerText = optionsDisplay[choice];
                p1ChoiceEl.style.transform = 'scale(1)';
                p1ChoiceEl.style.opacity = '1';
                p2ChoiceEl.style.transform = 'scale(1)';
                p2ChoiceEl.style.opacity = '1';
                determineWinner(player1Choice, choice, 'Player 2');
                player1Choice = null;
                setTimeout(() => {
                    enableChoices();
                    document.getElementById('result').innerText = 'Make your choice for the next round!';
                }, 2000);
            }, 10);
        }, 3000);
    }
}

function determineWinner(choice1, choice2, opponent) {
    let result = "";
    if (choice1 === choice2) {
        result = `Draw! Both chose ${optionsDisplay[choice1]}.`;
    } else if (
        (choice1 === "rock" && choice2 === "scissors") ||
        (choice1 === "paper" && choice2 === "rock") ||
        (choice1 === "scissors" && choice2 === "paper")
    ) {
        result = `Player 1 wins! ${optionsDisplay[choice1]} beats ${optionsDisplay[choice2]}.`;
        player1Score++;
        document.getElementById('player1-choice').classList.add('winner');
        if (soundSettings.win) {
            const winSound = document.getElementById('win-sound');
            winSound.pause();
            winSound.currentTime = 0;
            winSound.play();
        }
    } else {
        result = `${opponent} wins! ${optionsDisplay[choice2]} beats ${optionsDisplay[choice1]}.`;
        player2Score++;
        document.getElementById('player2-choice').classList.add('winner');
        if (soundSettings.win) {
            const winSound = document.getElementById('win-sound');
            winSound.pause();
            winSound.currentTime = 0;
            winSound.play();
        }
    }

    document.getElementById('result').innerText = result;
    document.getElementById('player1-score').innerText = player1Score;
    document.getElementById('player2-score').innerText = player2Score;

    setTimeout(() => {
        document.getElementById('player1-choice').classList.remove('winner');
        document.getElementById('player2-choice').classList.remove('winner');
    }, 2000);
}

function disableChoices() {
    document.getElementById('choices').classList.add('disabled');
}

function enableChoices() {
    document.getElementById('choices').classList.remove('disabled');
}

function resetGame() {
    player1Score = 0;
    player2Score = 0;
    player1Choice = null;
    document.getElementById('player1-score').innerText = player1Score;
    document.getElementById('player2-score').innerText = player2Score;
    document.getElementById('player1-choice').innerText = '?';
    document.getElementById('player2-choice').innerText = '?';
    document.getElementById('result').innerText = mode ? 'Make your choice!' : 'Select a mode to start!';
    enableChoices();
}