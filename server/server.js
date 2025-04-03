// rock-paper-scissors-project/server/server.js

const express = require('express');
const path = require('path');
const fs = require('fs'); // Import File System module to check directory existence
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http'); // Use http module for explicit server creation

// Import database connection from database.js (ensure it's in the same 'server' directory)
const db = require('./database');

const app = express();
// Use PORT from environment variable (for hosting platforms like Fly.io, Render) or default to 3000
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json()); // Parse JSON bodies

// --- Static File Serving Setup ---

// Define the absolute path to the public directory explicitly
// __dirname points to the 'server' directory where this script lives.
// '../public' goes up one level from 'server' and then into 'public'.
const publicDirectoryPath = path.join(__dirname, '../public');

// **Crucial Debugging Check:** Verify the public directory actually exists
if (!fs.existsSync(publicDirectoryPath)) {
    console.error(`[Server Error] FATAL: Public directory not found at expected path: ${publicDirectoryPath}`);
    console.error(`[Server Error] Please ensure the 'public' folder exists adjacent to the 'server' folder.`);
    process.exit(1); // Exit if the public directory is missing
} else {
    console.log(`[Server] Found public directory at: ${publicDirectoryPath}`);
}

// Serve static files from the 'public' directory
// This MUST come before the routes that handle specific paths like '/', '/game/:id', etc.
app.use(express.static(publicDirectoryPath));
console.log(`[Server] Static file serving configured for path: ${publicDirectoryPath}`);

// --- Visitor Tracking Middleware ---
app.use((req, res, next) => {
    // Attempt to get IP address reliably (consider Vercel/Fly.io headers)
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
               req.headers['fly-client-ip']?.split(',')[0].trim() || // For Fly.io
               req.socket.remoteAddress;
    if (!ip) {
        console.warn("[Visitor] Could not determine visitor IP address.");
        res.locals.username = 'Guest_NoIP'; // Assign a fallback username
        return next(); // Continue without DB interaction if IP is missing
    }

    const visitTime = new Date().toISOString();
    // Determine gameId if accessing a specific game URL
    const pathSegments = req.path.split('/');
    let gameId = null;
    // Check for /game/<8-hex-chars> format specifically
    if (pathSegments.length === 3 && pathSegments[1] === 'game') {
        if (/^[a-f0-9]{8}$/i.test(pathSegments[2])) {
             gameId = pathSegments[2];
        }
    }

    db.get('SELECT username FROM users WHERE ip = ?', [ip], (err, row) => {
        if (err) {
            console.error(`[DB Error] User query error for IP ${ip}:`, err.message);
            res.locals.username = 'Guest_DBError'; // Fallback on DB error
            return next(); // Continue processing request despite DB error
        }

        if (!row) {
            // New visitor
            const username = generateUsername(ip);
            db.run('INSERT INTO users (ip, username, visit_time, game_id) VALUES (?, ?, ?, ?)',
                [ip, username, visitTime, gameId], (insertErr) => {
                    if (insertErr) {
                        // Handle potential UNIQUE constraint violation gracefully
                        if (insertErr.code === 'SQLITE_CONSTRAINT') {
                            if (insertErr.message.includes('users.ip')) {
                                 console.warn(`[DB Warn] Race condition or reused IP for insert: ${ip}. Updating visit time.`);
                                 db.run('UPDATE users SET visit_time = ?, game_id = ? WHERE ip = ?',
                                     [visitTime, gameId, ip], (updateErr) => {
                                         if (updateErr) console.error(`[DB Error] User update error after insert fail for IP ${ip}:`, updateErr.message);
                                         // Fetch username again after potential update
                                         db.get('SELECT username FROM users WHERE ip = ?', [ip], (fetchErr, existingRow) => {
                                             res.locals.username = existingRow ? existingRow.username : username; // Use existing if found
                                             next();
                                         });
                                     });
                            } else if (insertErr.message.includes('users.username')) {
                                console.warn(`[DB Warn] Generated username collision for: ${username}. Regenerating.`);
                                const newUsername = generateUsername(ip); // Try a new one
                                db.run('INSERT INTO users (ip, username, visit_time, game_id) VALUES (?, ?, ?, ?)',
                                    [ip, newUsername, visitTime, gameId], (retryErr) => {
                                         if (retryErr) console.error(`[DB Error] User insert error after username collision retry for IP ${ip}:`, retryErr.message);
                                    });
                                 res.locals.username = newUsername; // Assign the new username
                                 next();
                            } else {
                                 // Other constraint error
                                 console.error(`[DB Error] User insert constraint error for IP ${ip}:`, insertErr.message);
                                 res.locals.username = username; // Still assign the initially generated one
                                 next();
                            }
                        } else {
                             // Non-constraint insert error
                             console.error(`[DB Error] User insert error for IP ${ip}:`, insertErr.message);
                             res.locals.username = username;
                             next();
                        }
                    } else {
                        // Successful insert
                        console.log(`[Visitor] New: ${username} (IP: ${ip})`);
                        res.locals.username = username;
                        next();
                    }
                });
        } else {
            // Existing visitor
            db.run('UPDATE users SET visit_time = ?, game_id = ? WHERE ip = ?',
                [visitTime, gameId, ip], (updateErr) => {
                    if (updateErr) {
                        console.error(`[DB Error] User update error for IP ${ip}:`, updateErr.message);
                    }
                });
            // Use the existing username from the DB
            res.locals.username = row.username;
            next();
        }
    });
});

// Helper function to generate a username (more unique version)
function generateUsername(ip) {
    // Simple hash based on IP parts (works for IPv4 and basic IPv6)
    const ipHash = ip.split(/[:.]+/).reduce((acc, part) => acc + (parseInt(part, 16) || parseInt(part, 10) || 0), 0) % 10000;
    // Slightly longer random string
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `User_${ipHash}_${randomStr}`;
}

// --- HTTP API Routes ---

// API to get the current user's assigned username
app.get('/api/username', (req, res) => {
    // Use username set by middleware, default to 'Guest' if somehow missing
    res.json({ username: res.locals.username || 'Guest' });
});

// Optional: API to list recent visitors (for debugging/admin)
app.get('/api/visitors', (req, res) => {
    db.all('SELECT username, ip, visit_time, game_id FROM users ORDER BY visit_time DESC LIMIT 50', [], (err, rows) => {
        if (err) {
            console.error('[DB Error] Visitors fetch error:', err.message);
            return res.status(500).json({ error: 'Error fetching visitor data.' });
        }
        res.json(rows);
    });
});

// API to create a new online game
app.post('/api/create-game', (req, res) => {
    const gameId = uuidv4().substring(0, 8); // Generate 8-char random ID
     const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                req.headers['fly-client-ip']?.split(',')[0].trim() || // For Fly.io
                req.socket.remoteAddress;
    if (!ip) {
        console.error("[Game Create Error] Could not determine client IP for game creation.");
        return res.status(400).json({ error: 'Could not determine client IP.' });
    }
    const createdAt = new Date().toISOString();
    console.log(`[Game Create] Attempting game ${gameId} for IP: ${ip}`);

    db.run('INSERT INTO games (game_id, player1_ip, created_at, status) VALUES (?, ?, ?, ?)',
        [gameId, ip, createdAt, 'waiting'], function(err) { // Use function() if you need this.lastID
            if (err) {
                console.error('[DB Error] Game creation error:', err.message);
                return res.status(500).json({ error: 'Failed to create game room.' });
            }
            console.log(`[Game Create] Success: Game ${gameId} created.`);
            // Update the user's record to link them to this game
            db.run('UPDATE users SET game_id = ? WHERE ip = ?', [gameId, ip], (userUpdateErr) => {
                if (userUpdateErr) console.error(`[DB Error] Failed to link game ${gameId} to user IP ${ip}:`, userUpdateErr.message);
            });
            // Return the game ID and the full link to join
            // Construct host carefully, consider proxy headers if applicable
            const host = req.get('host'); // e.g., 'localhost:3000' or 'yourdomain.com'
            const protocol = req.protocol; // 'http' or 'https'
            const link = `${protocol}://${host}/game/${gameId}`;
            res.status(201).json({ gameId, link });
        });
});

// --- HTML Serving Routes ---

// Route to join/view a specific game
// This needs to come AFTER API routes BUT BEFORE the final catch-all handlers
// It relies on the static middleware to serve assets referenced within index.html
app.get('/game/:id', (req, res, next) => {
    const gameId = req.params.id;

    // Strict validation for 8-character hexadecimal game ID
    if (!/^[a-f0-9]{8}$/i.test(gameId)) {
         console.log(`[Game Route] Path parameter "${gameId}" is not a valid game ID format. Passing to next handler.`);
         // Let it fall through to the 404 handler if not caught by static or root '/'
         return next();
    }

    // Validate the game ID exists in the database before serving the page
    db.get('SELECT game_id, status FROM games WHERE game_id = ?', [gameId], (err, row) => {
        if (err) {
            console.error(`[DB Error] Error fetching game ${gameId}:`, err.message);
            return res.status(500).send('Error checking game status.');
        }
        if (!row) {
            console.log(`[Game Join] Attempted to join non-existent game: ${gameId}`);
            // Provide a slightly more user-friendly 404 page
            return res.status(404).send(`<!DOCTYPE html><html><head><title>Game Not Found</title><style>body{font-family:sans-serif; padding: 20px; text-align: center;}</style></head><body><h2>Game Not Found</h2><p>The game with ID <strong>${gameId}</strong> does not exist or may have expired.</p><p><a href="/">Create or join another game?</a></p></body></html>`);
        }
        // Game exists, serve the main HTML file (assets are handled by static middleware)
        console.log(`[Game Join] Serving index.html for valid game ID: ${gameId}`);
        res.sendFile(path.join(publicDirectoryPath, 'index.html')); // Use absolute path
    });
});

// Root route: Serve the main game page
// Needs to be placed carefully - after specific API/game routes, before 404
app.get('/', (req, res) => {
    console.log("[Root Route] Serving index.html for /");
    res.sendFile(path.join(publicDirectoryPath, 'index.html')); // Use absolute path
});


// --- WebSocket Server Setup ---
const server = http.createServer(app); // Create HTTP server from Express app
const wss = new WebSocket.Server({ server }); // Attach WebSocket server
const games = new Map(); // In-memory store for active game states { gameId -> { players: [ws1, ws2], choices: Map<ws, choice> } }

wss.on('connection', (ws, req) => {
    // Extract gameId from the connection URL, e.g., /ws/abcdef12
    const urlParts = req.url?.split('/'); // Use optional chaining for safety
    // Path should be /ws/<gameId>
    const gameId = urlParts && urlParts.length === 3 && urlParts[1] === 'ws' && /^[a-f0-9]{8}$/i.test(urlParts[2])
                   ? urlParts[2]
                   : null;

    if (!gameId) {
        console.log(`[WS] Connection attempt with invalid URL path: ${req.url}. Expected /ws/<8-hex-gameId>`);
        ws.send(JSON.stringify({ error: 'Invalid connection path format.' }));
        ws.close(1008, "Invalid connection path"); // Policy Violation
        return;
    }

    console.log(`[WS] Connection attempt for game: ${gameId}`);

    // Verify game exists in DB before proceeding
    db.get('SELECT game_id, status FROM games WHERE game_id = ?', [gameId], (err, row) => {
        if (err || !row) {
             const errorMsg = err ? `DB error checking game ${gameId}` : `Game ${gameId} not found in DB`;
             console.log(`[WS] Rejecting connection: ${errorMsg}`);
             ws.send(JSON.stringify({ error: 'Game not found or has expired.' }));
             ws.close(1011, "Game not found");
             return;
         }
         // Optional: Check game status (e.g., don't allow joining 'finished' games)
         if (row.status === 'finished' || row.status === 'abandoned') {
             console.log(`[WS] Rejecting connection: Game ${gameId} is already ${row.status}.`);
             ws.send(JSON.stringify({ error: `This game has already ${row.status}.` }));
             ws.close(1008, "Game ended");
             return;
         }

        // Find or initialize the game state in the in-memory map
        let gameState = games.get(gameId);
        if (!gameState) {
            console.log(`[WS] Initializing in-memory state for game: ${gameId}`);
            gameState = { players: [], choices: new Map() }; // Use Map for choices {ws -> choice}
            games.set(gameId, gameState);
        }

        // Now handle the player joining this verified game state
        handlePlayerJoin(ws, gameState, gameId, row.status); // Pass DB status
     });
}); // End wss.on('connection')

function handlePlayerJoin(ws, gameState, gameId, dbStatus) {
    // Check if game is already full
    if (gameState.players.length >= 2) {
        console.log(`[WS] Rejecting connection: Game ${gameId} is full (in-memory check).`);
        ws.send(JSON.stringify({ error: 'This game session is already full.' }));
        ws.close(1008, "Game full");
        return;
    }

    // Add player to the game state
    gameState.players.push(ws);
    console.log(`[WS] Player joined game ${gameId}. Total players: ${gameState.players.length}`);

    // Store gameId and gameState reference directly on the WebSocket object for easy access later
    ws.gameId = gameId;
    ws.gameState = gameState;

    // --- Actions based on player count ---
    if (gameState.players.length === 1) {
        // First player joined
        ws.send(JSON.stringify({ message: "Waiting for opponent to join...", playerCount: 1 }));
        // Ensure DB status is 'waiting'
        if (dbStatus !== 'waiting') {
            db.run('UPDATE games SET status = ? WHERE game_id = ?', ['waiting', gameId], (err) => {
                 if(err) console.error(`[DB Error] Failed to set game ${gameId} to waiting on first player join:`, err.message);
            });
        }
    } else if (gameState.players.length === 2) {
        // Second player joined - Game starts!
        console.log(`[WS] Game ${gameId} is now active with 2 players.`);
        broadcast(gameState, { message: "Opponent connected! Make your choice.", playerCount: 2 });
        // Update game status in DB to 'active' and try to set player2_ip
        // Getting player 2 IP is tricky without authentication, relying on DB user tracking
         db.run(`
             UPDATE games
             SET status = 'active',
                 player2_ip = (
                     SELECT ip FROM users
                     WHERE game_id = ?
                       AND ip != (SELECT player1_ip FROM games WHERE game_id = ?)
                     ORDER BY visit_time DESC
                     LIMIT 1
                 )
             WHERE game_id = ? AND status != 'active'
         `, [gameId, gameId, gameId], // Pass gameId three times for the subqueries/conditions
         (err) => {
             if (err) console.error(`[DB Error] Failed to set game ${gameId} to active or assign player2_ip: ${err.message}`);
             else console.log(`[DB] Game ${gameId} status set to active.`);
         });
    }

    // --- WebSocket Message Handling (Choices) ---
    ws.on('message', (message) => {
        // Use stored references
        const currentGameState = ws.gameState;
        const currentGameId = ws.gameId;

        if (!currentGameState) {
             console.warn(`[WS] Received message for non-existent/cleaned-up game state (gameId: ${currentGameId}). Ignoring.`);
             // Optionally send an error back to the client if the ws is still open
             if (ws.readyState === WebSocket.OPEN) {
                 ws.send(JSON.stringify({ error: "Game session ended or not found." }));
                 ws.close(1011, "Game state missing");
             }
             return;
        }
        if (currentGameState.players.length < 2) {
            ws.send(JSON.stringify({ message: "Still waiting for opponent..." }));
            return; // Don't process choices until 2 players are present
        }

        let data;
        try {
            const messageString = message instanceof Buffer ? message.toString() : message;
            data = JSON.parse(messageString);
            if (typeof data !== 'object' || data === null || !['rock', 'paper', 'scissors'].includes(data.choice)) {
                 throw new Error('Invalid message format or choice.');
             }
        } catch (e) {
            console.warn(`[WS] Invalid message received for game ${currentGameId}:`, message, e.message);
            ws.send(JSON.stringify({ error: `Invalid message: ${e.message}` }));
            return;
        }

        // Check if player already chose this round
        if (currentGameState.choices.has(ws)) {
             console.log(`[WS] Player in game ${currentGameId} tried to choose again.`);
             ws.send(JSON.stringify({ message: "You already chose. Waiting for opponent..." }));
             return;
        }

        console.log(`[WS] Received choice '${data.choice}' from player in game ${currentGameId}`);
        currentGameState.choices.set(ws, data.choice); // Store choice using ws object as key
        ws.send(JSON.stringify({ message: "Choice received. Waiting..." }));

        // Notify the opponent when a player makes their first move
        if (!currentGameState.choices.has(ws)) {
            console.log(`[WS] Player in game ${currentGameId} made their first move.`);
            const opponent = currentGameState.players.find(player => player !== ws);
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ message: "Your opponent has made their first move!" }));
            }
        }

        // --- Check if round is complete ---
        if (currentGameState.choices.size === 2) {
            console.log(`[WS] Both players chose in game ${currentGameId}. Determining result.`);
            const choicesArray = Array.from(currentGameState.choices.entries()); // [[ws1, choice1], [ws2, choice2]]

            // Ensure both player websockets are still valid before sending
            if (choicesArray.length === 2 && choicesArray[0][0] && choicesArray[1][0]) {
                const [p1ws, p1choice] = choicesArray[0];
                const [p2ws, p2choice] = choicesArray[1];

                // Send specific results to each player
                 if (p1ws.readyState === WebSocket.OPEN) {
                     p1ws.send(JSON.stringify({ yourChoice: p1choice, opponentChoice: p2choice }));
                 } else { console.log(`[WS] Player 1 in game ${currentGameId} disconnected before result.`); }
                 if (p2ws.readyState === WebSocket.OPEN) {
                     p2ws.send(JSON.stringify({ yourChoice: p2choice, opponentChoice: p1choice }));
                 } else { console.log(`[WS] Player 2 in game ${currentGameId} disconnected before result.`); }

                // Clear choices map for the next round
                currentGameState.choices.clear();
                console.log(`[WS] Choices cleared for game ${currentGameId}.`);
                 // Optional: Slight delay before prompting for next choice might feel better UI-wise
                 setTimeout(() => {
                    // Check state again before broadcasting, in case someone disconnected during timeout
                    if (currentGameState.players.length === 2) {
                        broadcast(currentGameState, { message: "Make your next choice!" });
                    }
                 }, 100); // Short delay
            } else {
                 console.warn(`[WS] Round completion check failed for game ${currentGameId} - player(s) might have disconnected.`);
                 // Clear choices anyway
                 currentGameState.choices.clear();
                 // The 'close' handler should manage notifying remaining player
            }
        }
    }); // End ws.on('message')

    // --- WebSocket Close Handling ---
    ws.on('close', (code, reason) => {
        // Use stored references
        const closedGameId = ws.gameId;
        const closedGameState = ws.gameState;
        const reasonString = reason instanceof Buffer ? reason.toString() : (reason || 'N/A'); // Handle empty reason
        console.log(`[WS] Player disconnected from game ${closedGameId}. Code: ${code}, Reason: ${reasonString}`);

        if (!closedGameState) {
             console.log(`[WS] Game state for ${closedGameId} not found during close event (already cleaned up?).`);
             return; // Nothing more to do if state is already gone
        }

        // Remove player from the in-memory state using filter
        const playerIndex = closedGameState.players.indexOf(ws);
        if (playerIndex > -1) {
            closedGameState.players.splice(playerIndex, 1);
            console.log(`[WS] Player removed from game ${closedGameId}. Remaining: ${closedGameState.players.length}`);
        } else {
             console.warn(`[WS] Disconnecting player not found in game state for ${closedGameId}. State may be inconsistent.`);
        }
        // Also remove their choice if they disconnect mid-round
        closedGameState.choices.delete(ws);


        // --- Actions based on remaining players ---
        if (closedGameState.players.length === 0) {
            // Game is now empty
            console.log(`[WS] Game ${closedGameId} is empty. Removing from memory and updating DB.`);
            games.delete(closedGameId); // Remove from in-memory map
            db.run('UPDATE games SET status = ? WHERE game_id = ?', ['abandoned', closedGameId], (err) => {
                if (err) console.error(`[DB Error] Failed to update game ${closedGameId} to abandoned:`, err.message);
            });
        } else if (closedGameState.players.length === 1) {
            // One player remaining
            const remainingPlayer = closedGameState.players[0];
            // Clear any choices from the round that was interrupted (already done above)
            // closedGameState.choices.clear();
            // Notify remaining player
            if (remainingPlayer.readyState === WebSocket.OPEN) {
                 remainingPlayer.send(JSON.stringify({
                    playerCount: 1,
                    message: "Your opponent has disconnected. Waiting..."
                 }));
            }
            // Update DB status back to 'waiting' and clear player 2 IP
            db.run('UPDATE games SET status = ?, player2_ip = NULL WHERE game_id = ?', ['waiting', closedGameId], (err) => {
                 if (err) console.error(`[DB Error] Failed to set game ${closedGameId} back to waiting:`, err.message);
                 else console.log(`[DB] Game ${closedGameId} status set back to waiting.`);
            });
        }
        // If 2 players remain (shouldn't happen on 'close'), do nothing extra here
    }); // End ws.on('close')

     // --- WebSocket Error Handling ---
     ws.on('error', (error) => {
         const errorGameId = ws.gameId || 'unknown';
         console.error(`[WS] WebSocket error for player in game ${errorGameId}:`, error);
         // 'close' event usually follows an error, cleanup is handled there.
         // Force close if necessary to ensure cleanup happens
         if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
             console.log(`[WS] Terminating WebSocket due to error for game ${errorGameId}.`);
             ws.terminate();
         }
     });

} // End handlePlayerJoin function

// Helper function to broadcast messages to all players in a specific game state
function broadcast(gameState, messageObject) {
    if (!gameState || !gameState.players) return;
    const messageString = JSON.stringify(messageObject);
    const gameIdForLog = gameState.players[0]?.gameId || 'unknown'; // Get gameId if possible for logging

    // console.log(`[WS] Broadcasting to game ${gameIdForLog}: ${messageString}`); // Verbose log
    gameState.players.forEach(client => {
        // Check if the client is still stored and connection is open
        if (client && client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageString);
            } catch (sendError) {
                console.error(`[WS] Error sending message to client in game ${client.gameId || gameIdForLog}:`, sendError);
                // Consider terminating client here if send fails repeatedly,
                // but 'close'/'error' events should ideally handle cleanup.
            }
        }
    });
}


// --- Catch-all 404 Handler ---
// This MUST be the last route definition before error handlers
app.use((req, res, next) => {
  // Check if the request was likely for a static file that wasn't found
  // This helps differentiate API/route typos from missing assets
  if (req.path.includes('.')) { // Basic check for file extension
      console.log(`[404 Handler] Static asset not found: ${req.method} ${req.originalUrl}`);
  } else {
      console.log(`[404 Handler] Route/Endpoint not found: ${req.method} ${req.originalUrl}`);
  }
  res.status(404).send(`Sorry, can't find ${req.originalUrl}`);
});

// --- Generic Error Handling Middleware ---
// Must have 4 arguments (err, req, res, next) to be recognized as error handler
app.use((err, req, res, next) => {
  console.error("[Server Error - Unhandled]", err.stack || err);
  // Avoid sending stack trace in production environment
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Something went wrong on the server!' : err.message || 'Internal Server Error';
  res.status(status).send(message);
});


// --- Server Start and Graceful Shutdown ---
server.listen(port, () => {
    console.log(`[Server] HTTP and WebSocket server running on http://localhost:${port}`);
});

// Graceful shutdown logic
function shutdown(signal) {
    console.log(`[Server] ${signal} signal received. Shutting down gracefully...`);
    let shutdownComplete = false; // Flag to prevent multiple exits

    // Force exit after a timeout
    const shutdownTimeout = setTimeout(() => {
        if (!shutdownComplete) {
            console.error('[Server] Graceful shutdown timed out. Forcing exit.');
            process.exit(1);
        }
    }, 10000); // 10 second overall timeout

    // 1. Close WebSocket connections
    const totalConnections = wss.clients.size;
    console.log(`[WS] Closing ${totalConnections} WebSocket connections...`);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.close(1012, "Server is restarting"); // 1012 = Service Restart
        }
    });

    // Wait briefly for WS clients to close before closing servers
    // Alternatively, track closed connections if precise timing needed
    setTimeout(() => {
        // 2. Close the WebSocket server itself
        wss.close((err) => {
            if (err) { console.error('[WS] Error closing WebSocket server:', err); }
            else { console.log('[WS] WebSocket server closed.'); }

            // 3. Close the HTTP server (stops accepting new connections)
            server.close((err) => {
                if (err) { console.error('[Server] Error closing HTTP server:', err); }
                else { console.log('[Server] HTTP server closed.'); }

                // 4. Close the Database connection (LAST)
                console.log('[DB] Closing database connection...');
                db.close((err) => {
                    shutdownComplete = true; // Mark shutdown as complete
                    clearTimeout(shutdownTimeout); // Clear the force exit timeout
                    if (err) {
                        console.error('[DB Error] Error closing database:', err.message);
                        process.exitCode = 1; // Set exit code to indicate error
                    } else {
                        console.log('[DB] Database connection closed.');
                        process.exitCode = 0; // Set exit code to indicate success
                    }
                    console.log('[Server] Shutdown complete.');
                    // Let the process exit naturally now based on process.exitCode
                });
            });
        });
    }, 1500); // Wait 1.5 seconds for WS clients to hopefully disconnect
}

process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Termination signal from OS/hosting