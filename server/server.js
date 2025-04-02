const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http'); // Use http module for explicit server creation

// Import database connection from database.js
const db = require('./database');

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json()); // Parse JSON bodies

// Define the absolute path to the public directory explicitly
const publicDirectoryPath = path.join(__dirname, '../public');
console.log(`[Server] Serving static files from: ${publicDirectoryPath}`); // Add log to verify path

// Serve static files - THIS MUST BE CORRECT and MUST be before specific routes
app.use(express.static(publicDirectoryPath));

// Middleware to track visitors and assign usernames
app.use((req, res, next) => {
    // Attempt to get IP address reliably
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (!ip) {
        console.warn("Could not determine visitor IP address.");
        res.locals.username = 'Guest_NoIP'; // Assign a fallback username
        return next(); // Continue without DB interaction if IP is missing
    }

    const visitTime = new Date().toISOString();
    // Determine gameId if accessing a specific game URL
    const pathSegments = req.path.split('/');
    let gameId = null;
    if (pathSegments.length === 3 && pathSegments[1] === 'game') {
        if (/^[a-f0-9]{8}$/i.test(pathSegments[2]) && !pathSegments[2].includes('.')) {
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
                        // Handle potential UNIQUE constraint violation gracefully (e.g., if IP reused quickly)
                        if (insertErr.code === 'SQLITE_CONSTRAINT' && insertErr.message.includes('UNIQUE constraint failed: users.ip')) {
                             console.warn(`[DB Warn] Race condition or reused IP for insert: ${ip}. Attempting update.`);
                             db.run('UPDATE users SET visit_time = ?, game_id = ? WHERE ip = ?',
                                 [visitTime, gameId, ip], (updateErr) => {
                                     if (updateErr) console.error(`[DB Error] User update error after insert fail for IP ${ip}:`, updateErr.message);
                                     db.get('SELECT username FROM users WHERE ip = ?', [ip], (fetchErr, existingRow) => {
                                         res.locals.username = existingRow ? existingRow.username : username;
                                         next();
                                     });
                                     return;
                                 });
                        } else if (insertErr.code === 'SQLITE_CONSTRAINT' && insertErr.message.includes('UNIQUE constraint failed: users.username')) {
                            console.warn(`[DB Warn] Generated username collision for: ${username}. Regenerating.`);
                            const newUsername = generateUsername(ip);
                            db.run('INSERT INTO users (ip, username, visit_time, game_id) VALUES (?, ?, ?, ?)',
                                [ip, newUsername, visitTime, gameId], (retryErr) => {
                                     if (retryErr) console.error(`[DB Error] User insert error after username collision retry for IP ${ip}:`, retryErr.message);
                                });
                             res.locals.username = newUsername;
                             next();
                             return;
                        } else {
                             console.error(`[DB Error] User insert error for IP ${ip}:`, insertErr.message);
                             res.locals.username = username;
                             next();
                             return;
                        }
                    } else {
                        console.log(`[Visitor] New: ${username} (IP: ${ip})`);
                        res.locals.username = username;
                        next();
                        return;
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
            res.locals.username = row.username;
            next();
        }
    });
});

// Helper function to generate a username (simple version)
function generateUsername(ip) {
    const ipHash = ip.split('.').reduce((acc, part, index) => acc + (parseInt(part, 10) * (index + 1)), 0) % 1000;
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `User${ipHash}${randomStr}`;
}

// --- HTTP Routes ---

// Simple API to get the current user's assigned username
// Place specific API routes before more general ones
app.get('/api/username', (req, res) => {
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
    const gameId = uuidv4().substring(0, 8);
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (!ip) {
        console.error("[Game Create Error] Could not determine client IP for game creation attempt.");
        return res.status(400).json({ error: 'Could not determine client IP.' });
    }
    const createdAt = new Date().toISOString();
    console.log(`[Game Create] Attempting game ${gameId} for IP: ${ip}`);
    db.run('INSERT INTO games (game_id, player1_ip, created_at, status) VALUES (?, ?, ?, ?)',
        [gameId, ip, createdAt, 'waiting'], function(err) {
            if (err) {
                console.error('[DB Error] Game creation error:', err.message);
                return res.status(500).json({ error: 'Failed to create game room.' });
            }
            console.log(`[Game Create] Success: Game ${gameId} created.`);
            db.run('UPDATE users SET game_id = ? WHERE ip = ?', [gameId, ip], (userUpdateErr) => {
                if (userUpdateErr) console.error(`[DB Error] Failed to link game ${gameId} to user IP ${ip}:`, userUpdateErr.message);
            });
            res.status(201).json({ gameId, link: `${req.protocol}://${req.get('host')}/game/${gameId}` });
        });
});

// Route to join/view a specific game
// This should come AFTER specific API routes and potentially AFTER the root '/' route
app.get('/game/:id', (req, res, next) => { // Added next
    const gameId = req.params.id;

    // Prevent static filenames from being treated as game IDs
    // Using regex for 8 hex characters
    if (!/^[a-f0-9]{8}$/i.test(gameId)) {
         console.log(`[Game Route] Path parameter "${gameId}" rejected as invalid game ID format. Passing through.`);
         return next(); // Pass control to the next middleware/handler (e.g., 404 handler)
    }

    // Validate the game ID exists in the database before serving the page
    db.get('SELECT game_id, status FROM games WHERE game_id = ?', [gameId], (err, row) => {
        if (err) {
            console.error(`[DB Error] Error fetching game ${gameId}:`, err.message);
            return res.status(500).send('Error checking game status.');
        }
        if (!row) {
            console.log(`[Game Join] Attempted to join non-existent game: ${gameId}`);
            return res.status(404).send(`Game with ID '${gameId}' not found. <a href="/">Create a new game?</a>`);
        }
        // Game exists, serve the main HTML file
        // Let express.static handle serving assets linked within index.html
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });
});

// Root route: Serve the main game page
// Placing this *after* API routes and potentially after static (though static order matters most)
// but *before* the final 404 handler.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- WebSocket Server Setup --- (Keep this section as is)
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const games = new Map();
// ... (wss.on('connection', handlePlayerJoin, broadcast functions remain unchanged) ...
// Copy the full WebSocket section from your previous correct version here
wss.on('connection', (ws, req) => {
    // Extract gameId from the connection URL, e.g., /ws/abcdef12
    const urlParts = req.url?.split('/'); // Use optional chaining
    const gameId = urlParts && urlParts.length === 3 && urlParts[1] === 'ws' ? urlParts[2] : null;

    if (!gameId) {
        console.log('[WS] Connection attempt without valid game ID in URL.');
        ws.send(JSON.stringify({ error: 'Invalid game link format.' }));
        ws.close(1008, "Missing or invalid game ID"); // Policy Violation
        return;
    }

    console.log(`[WS] Connection attempt for game: ${gameId}`);

    // Verify game exists in DB before creating in-memory state
    db.get('SELECT game_id, status FROM games WHERE game_id = ?', [gameId], (err, row) => {
        if (err || !row) {
             console.log(`[WS] Rejecting connection: Game ${gameId} not found in DB or DB error.`);
             ws.send(JSON.stringify({ error: 'Game not found or has expired.' }));
             ws.close(1011, "Game not found"); // Internal Error / Not Found
             return;
         }
         // Optional: Check if game status prevents joining (e.g., 'finished')
         // if (row.status === 'finished' || row.status === 'abandoned') { ... reject ... }


        // Find or initialize the game state in the map
        let gameState = games.get(gameId);
        if (!gameState) {
            console.log(`[WS] Initializing in-memory state for game: ${gameId}`);
            gameState = { players: [], choices: new Map() }; // Use Map for choices
            games.set(gameId, gameState);
        }

        // Now handle the player joining this verified game state
        handlePlayerJoin(ws, gameState, gameId, row.status);
     });
}); // <<< --- Correct closing bracket for wss.on('connection',...)

function handlePlayerJoin(ws, gameState, gameId, dbStatus) {
    // Check if game is already full
    if (gameState.players.length >= 2) {
        // Corrected template literal for logging:
        console.log(`[WS] Rejecting connection: Game ${gameId} is full.`);
        ws.send(JSON.stringify({ error: 'This game session is already full (2 players max).' }));
        ws.close(1008, "Game full");
        return;
    }

    // Add player to the game state
    gameState.players.push(ws);
    console.log(`[WS] Player joined game ${gameId}. Total players: ${gameState.players.length}`);

    // Add reference to gameState and gameId on the websocket object for easier cleanup
    ws.gameId = gameId;
    ws.gameState = gameState; // Direct reference to the state object

    // Notify player about current status and wait if necessary
    if (gameState.players.length === 1) {
        ws.send(JSON.stringify({ message: "Waiting for opponent to join...", playerCount: 1 }));
        // Update DB status if needed (e.g., if it was 'abandoned' previously)
        if (dbStatus !== 'waiting') {
            db.run('UPDATE games SET status = ? WHERE game_id = ?', ['waiting', gameId]);
        }
    } else if (gameState.players.length === 2) {
         // Notify both players
         broadcast(gameState, { message: "Opponent connected! Make your choice.", playerCount: 2 });
         // Update game status in DB to 'active'
         // Corrected query to get the IP of the second player based on join time (assuming latest user entry for this game is P2)
         db.run(`
             UPDATE games
             SET status = 'active',
                 player2_ip = (SELECT ip FROM users WHERE rowid = (SELECT MAX(rowid) FROM users WHERE game_id = ?))
             WHERE game_id = ?
         `, [gameId, gameId],
         (err) => {
             // Corrected template literal for logging:
             if (err) console.error(`[DB Error] Failed to set game ${gameId} to active or assign player2_ip: ${err.message}`);
         });
    }


    // --- WebSocket Message Handling ---
    ws.on('message', (message) => {
        // Ensure the game state still exists (might have been cleaned up)
        const currentGameState = ws.gameState; // Use reference stored on ws
        if (!currentGameState) {
             console.warn(`[WS] Received message for non-existent game state (gameId: ${ws.gameId}). Ignoring.`);
             return;
        }
        // Ensure game has 2 players before accepting choices
        if (currentGameState.players.length < 2) {
            ws.send(JSON.stringify({ message: "Waiting for opponent..." }));
            return;
        }

        let data;
        try {
            // Handle binary data (Buffer) by converting to string
            const messageString = message instanceof Buffer ? message.toString() : message;
            data = JSON.parse(messageString);

            // Basic validation
            if (typeof data !== 'object' || data === null || !['rock', 'paper', 'scissors'].includes(data.choice)) {
                 console.warn(`[WS] Invalid message received for game ${ws.gameId}:`, messageString);
                 ws.send(JSON.stringify({ error: 'Invalid message format or choice.' }));
                 return;
             }
        } catch (e) {
            console.warn(`[WS] Non-JSON or invalid message received for game ${ws.gameId}:`, message, e);
            ws.send(JSON.stringify({ error: 'Invalid message format.' }));
            return;
        }

        // Check if player already made a choice for this round (using Map.has)
        if (currentGameState.choices.has(ws)) {
             console.log(`[WS] Player in game ${ws.gameId} tried to choose again.`);
             ws.send(JSON.stringify({ message: "You already chose for this round. Waiting..." }));
             return;
        }

        console.log(`[WS] Received choice '${data.choice}' from player in game ${ws.gameId}`);

        // Store the choice associated with the player's WebSocket connection
        currentGameState.choices.set(ws, data.choice);
        ws.send(JSON.stringify({ message: "Choice received. Waiting for opponent..." }));

        // Check if both players have made their choices (using Map.size)
        if (currentGameState.choices.size === 2) {
            console.log(`[WS] Both players chose in game ${ws.gameId}. Determining result.`);
            const choicesArray = Array.from(currentGameState.choices.entries()); // [[ws1, choice1], [ws2, choice2]]

            const p1ws = choicesArray[0][0];
            const p1choice = choicesArray[0][1];
            const p2ws = choicesArray[1][0];
            const p2choice = choicesArray[1][1];

            // Send results to each player (their choice + opponent's choice)
             p1ws.send(JSON.stringify({ yourChoice: p1choice, opponentChoice: p2choice }));
             p2ws.send(JSON.stringify({ yourChoice: p2choice, opponentChoice: p1choice }));

            // Clear choices map for the next round
            currentGameState.choices.clear();
            console.log(`[WS] Choices cleared for game ${ws.gameId}, ready for next round.`);
             broadcast(currentGameState, { message: "Round finished! Make your next choice." });
        }
    }); // <<< --- Correct closing bracket for ws.on('message',...)

    // --- WebSocket Close Handling ---
    ws.on('close', (code, reason) => {
        const closedGameId = ws.gameId; // Get gameId before potentially losing ws reference
        const closedGameState = ws.gameState;
        const reasonString = reason instanceof Buffer ? reason.toString() : reason;
        console.log(`[WS] Player disconnected from game ${closedGameId}. Code: ${code}, Reason: ${reasonString || 'N/A'}`);

        // Remove player from the active game state if it still exists
        if (closedGameState) {
             closedGameState.players = closedGameState.players.filter(player => player !== ws);
             console.log(`[WS] Remaining players in game ${closedGameId}: ${closedGameState.players.length}`);

            // If the game is now empty or has one player left
            if (closedGameState.players.length < 2) {
                // Clear any pending choices if someone leaves mid-round
                closedGameState.choices.clear();

                if (closedGameState.players.length === 0) {
                    console.log(`[WS] Game ${closedGameId} is empty. Removing from memory and DB.`);
                    games.delete(closedGameId);
                    // Optional: Mark as 'abandoned' or delete from DB
                    db.run('UPDATE games SET status = ? WHERE game_id = ?', ['abandoned', closedGameId], (err) => {
                    // db.run('DELETE FROM games WHERE game_id = ?', [closedGameId], (err) => { // Alternative: Delete
                        if (err) console.error(`[DB Error] Failed to update/delete game ${closedGameId} on empty:`, err.message);
                    });
                } else {
                    // Notify the remaining player
                     const remainingPlayer = closedGameState.players[0];
                     if (remainingPlayer && remainingPlayer.readyState === WebSocket.OPEN) {
                          remainingPlayer.send(JSON.stringify({
                             playerCount: 1,
                             message: "Your opponent has disconnected. Waiting for a new player..." // Or end game
                          }));
                     }
                     // Update game status in DB back to 'waiting'
                     db.run('UPDATE games SET status = ?, player2_ip = NULL WHERE game_id = ?', ['waiting', closedGameId], (err) => {
                          if (err) console.error(`[DB Error] Failed to set game ${closedGameId} to waiting:`, err.message);
                     });
                }
            }
        } else {
             console.log(`[WS] Game state for ${closedGameId} not found during close event (already cleaned up?).`);
        }
    }); // <<< --- Correct closing bracket for ws.on('close',...)

     ws.on('error', (error) => {
         console.error(`[WS] WebSocket error for player in game ${ws.gameId}:`, error);
         // The 'close' event will usually follow, handling cleanup there.
         // Consider closing the connection explicitly if it's still open after an error
         if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
             ws.terminate(); // Force close
         }
     });
} // <<< --- Correct closing bracket for handlePlayerJoin function

// Helper function to broadcast messages to all players in a game
function broadcast(gameState, messageObject) {
    if (!gameState || !gameState.players) return;
    const messageString = JSON.stringify(messageObject);
    // Find gameId for logging (optional, assumes players have ws.gameId)
    // const gameIdForLog = gameState.players[0]?.gameId || 'unknown';
    // console.log(`[WS] Broadcasting to game ${gameIdForLog}: ${messageString}`);
    gameState.players.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageString);
            } catch (sendError) {
                // Corrected template literal for logging:
                console.error(`[WS] Error sending message to client in game ${client.gameId}:`, sendError);
            }
        }
    });
}


// --- Catch-all 404 Handler ---
// This should be the VERY LAST non-error handling middleware/route
app.use((req, res, next) => {
  console.log(`[404 Handler] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).send("Sorry, can't find that!");
});

// --- Error Handling Middleware ---
// Optional, but good practice
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err.stack);
  res.status(500).send('Something broke!');
});


// --- Server Start and Shutdown ---
server.listen(port, () => {
    console.log(`[Server] HTTP and WebSocket server running on http://localhost:${port}`);
});

// Graceful shutdown: Close DB connection when server stops
process.on('SIGINT', () => {
    console.log('[Server] SIGINT received. Shutting down gracefully...');
    // Close WebSocket connections first
    wss.clients.forEach(client => {
        client.close(1012, "Server shutting down"); // Service Restart code
    });
    wss.close(() => {
        console.log('[WS] WebSocket server closed.');
        // Close HTTP server after WS server
        server.close(() => {
            console.log('[Server] HTTP server closed.');
            // Close DB connection last
            db.close((err) => {
                if (err) {
                    console.error('[DB Error] Error closing database connection:', err.message);
                    process.exit(1); // Exit with error code if DB fails to close
                }
                console.log('[DB] Database connection closed.');
                process.exit(0); // Exit successfully
            });
        });
    });


    // Force shutdown after a timeout if graceful shutdown fails
    setTimeout(() => {
        console.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 5000); // 5 second timeout
});