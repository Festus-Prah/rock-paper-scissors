# Rock Paper Scissors - Online Multiplayer Game ✂️🧱🧻

A classic Rock Paper Scissors game built with Node.js, Express, WebSockets, and SQLite, allowing users to play against the computer, a friend locally, or an opponent online via a shareable link.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) <!-- Optional license badge -->

<!-- Add a screenshot or GIF here if you have one! -->
<!-- ![Game Screenshot](path/to/your/screenshot.png) -->

## Features ✨

*   **Multiple Game Modes:**
    *   **vs Computer:** Play against a simple random AI.
    *   **vs Friend (Local):** Two players share the same screen.
    *   **Online Multiplayer:** Create a unique game link, share it with a friend, and play in real-time.
*   **Real-time Gameplay:** Uses WebSockets (`ws` library) for instant communication in online mode.
*   **Persistent Usernames:** Assigns a generated username based on IP address for returning visitors (tracked via SQLite).
*   **Link Sharing:** Easily generate and copy unique game links for online matches.
*   **Score Tracking:** Keeps track of scores for the current session.
*   **Theme Selection:** Choose from multiple visual themes to customize the look and feel.
*   **Sound Controls:** Toggle background music and adjust volume.
*   **Responsive Design:** Adapts to different screen sizes (basic responsiveness).

## Live Demo  hosted by Replit 🚀

You can play a live version of the game here:
[https://rock-paper-scissors-3.onrender.com](https://rock-paper-scissors-3.onrender.com)

<!-- ## Screenshots 📸 -->
<!-- Add more screenshots showcasing different modes or themes -->
<!-- ![Screenshot 1](path/to/screenshot1.png) -->
<!-- ![Screenshot 2](path/to/screenshot2.png) -->

## Tech Stack 💻

*   **Backend:** Node.js, Express.js
*   **Real-time Communication:** WebSocket (`ws` library)
*   **Database:** SQLite3 (for user/game persistence)
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **Other Libraries:** `uuid` (for generating unique game IDs)

## Setup and Installation ⚙️

Follow these steps to get the project running locally:

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd rock-paper-scissors
    ```
    *(Replace `<your-repository-url>` with the actual URL of your Git repository)*

2.  **Install dependencies:**
    Make sure you have Node.js and npm installed.
    ```bash
    npm install
    ```

## Running the Application ▶️

1.  **Start the server:**
    ```bash
    npm start
    ```
    This will start both the HTTP server and the WebSocket server.

2.  **Open your browser:**
    Navigate to `http://localhost:3000` (or the port specified in your environment/code).

## How to Play 🎮

1.  **Select Mode:** Open the Settings panel (⚙️ icon) and choose a game mode (vs Computer, vs Friend, Online).
2.  **vs Computer:** Simply click on Rock (🧱), Paper (🧻), or Scissors (✂️). The computer will make its choice, and the result will be displayed.
3.  **vs Friend (Local):**
    *   Player 1 clicks their choice. A confirmation appears.
    *   Player 2 clicks their choice.
    *   The choices are revealed, and the winner is determined.
4.  **Online:**
    *   Select "Online" mode in Settings.
    *   Click "Create Game Link".
    *   Copy the generated link and share it with your friend.
    *   You will automatically connect and wait for your opponent.
    *   Once your friend joins using the link, the game begins. Make your choices each round.

## Project Structure 📁"# rock-paper-scissors" 
