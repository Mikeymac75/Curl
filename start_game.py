import http.server
import socketserver
import webbrowser
import os

# --- Game Configuration ---
PORT = 8080
FILENAME = "curling.html"

# --- HTML, CSS, and JavaScript for the Game ---
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simple Curling Game</title>
    <style>
        /* Basic styling for the page */
        body {
            background-color: #1a202c; /* Dark blue-gray background */
            color: #e2e8f0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 0;
            height: 100vh;
            overflow: hidden;
        }

        /* Styling for the game canvas */
        canvas {
            background-color: #ffffff; /* White ice surface */
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        }

        /* Container for controls and info */
        .game-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 800px;
            padding: 15px 0;
        }

        /* Styling for buttons and text displays */
        .info-box, button {
            background-color: #2d3748;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }

        button {
            border: none;
            color: #e2e8f0;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }

        button:hover {
            background-color: #4a5568;
        }
        
        .team-indicator {
            display: flex;
            align-items: center;
        }
        
        .color-box {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 10px;
            border: 2px solid #e2e8f0;
        }
    </style>
</head>
<body>

    <h1>Simple Curling Game</h1>
    
    <div class="game-info">
        <div id="status" class="info-box">Aim and release to throw!</div>
        <div class="info-box">
            <span>Score: </span>
            <span style="color: #e53e3e;">Red: <span id="score-red">0</span></span> | 
            <span style="color: #4299e1;">Blue: <span id="score-blue">0</span></span>
        </div>
        <button id="resetButton">New Game</button>
    </div>

    <canvas id="gameCanvas" width="800" height="400"></canvas>

    <script>
        // --- JavaScript Game Logic ---

        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');

        // UI Elements
        const statusEl = document.getElementById('status');
        const scoreRedEl = document.getElementById('score-red');
        const scoreBlueEl = document.getElementById('score-blue');
        const resetButton = document.getElementById('resetButton');

        // Game constants
        const HOUSE_CENTER_X = canvas.width - 120;
        const HOUSE_CENTER_Y = canvas.height / 2;
        const START_X = 100;
        const STONE_RADIUS = 15;
        const FRICTION = 0.98; // closer to 1 means less friction
        const STONES_PER_TEAM = 4;
        
        // Colors
        const COLOR_RED = '#e53e3e';
        const COLOR_BLUE = '#4299e1';
        const COLOR_ICE = '#ffffff';
        const COLOR_HOUSE_BLUE = '#a0deff';
        const COLOR_HOUSE_RED = '#ffc0c0';
        const COLOR_BUTTON = '#f6ad55';

        // Game state variables
        let stones = [];
        let currentTeam = 'red';
        let stonesThrownThisTurn = 0;
        let totalStonesThrown = 0;
        let score = { red: 0, blue: 0 };
        let gameState = 'aiming'; // can be 'aiming', 'sliding', 'scoring', 'gameover'
        
        // Mouse input variables
        let isAiming = false;
        let aimStart = { x: 0, y: 0 };
        let aimEnd = { x: 0, y: 0 };

        // --- Drawing Functions ---

        function drawHouse() {
            // Draw the outer blue ring
            ctx.beginPath();
            ctx.arc(HOUSE_CENTER_X, HOUSE_CENTER_Y, 80, 0, Math.PI * 2);
            ctx.fillStyle = COLOR_HOUSE_BLUE;
            ctx.fill();
            
            // Draw the inner red ring
            ctx.beginPath();
            ctx.arc(HOUSE_CENTER_X, HOUSE_CENTER_Y, 40, 0, Math.PI * 2);
            ctx.fillStyle = COLOR_HOUSE_RED;
            ctx.fill();

            // Draw the button (center circle)
            ctx.beginPath();
            ctx.arc(HOUSE_CENTER_X, HOUSE_CENTER_Y, 20, 0, Math.PI * 2);
            ctx.fillStyle = COLOR_BUTTON;
            ctx.fill();
        }

        function drawStone(stone) {
            ctx.beginPath();
            ctx.arc(stone.x, stone.y, STONE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = stone.color;
            ctx.fill();

            // Add a little highlight to make it look nicer
            ctx.beginPath();
            ctx.arc(stone.x - 4, stone.y - 4, STONE_RADIUS / 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
        }
        
        function drawAimingLine() {
            if (gameState === 'aiming' && isAiming) {
                // Draw line from stone to mouse
                ctx.beginPath();
                ctx.moveTo(START_X, canvas.height / 2);
                ctx.lineTo(START_X - (aimEnd.x - aimStart.x), canvas.height / 2 - (aimEnd.y - aimStart.y));
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 3;
                ctx.stroke();

                // Draw power indicator
                const power = Math.hypot(aimEnd.x - aimStart.x, aimEnd.y - aimStart.y) / 10;
                statusEl.textContent = `Power: ${Math.min(100, power).toFixed(0)}%`;
            }
        }

        function drawCurrentThrowStone() {
            if (gameState === 'aiming') {
                drawStone({ x: START_X, y: canvas.height / 2, color: currentTeam === 'red' ? COLOR_RED : COLOR_BLUE });
            }
        }

        // --- Game Logic Functions ---

        function update() {
            // Clear the canvas for redrawing
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            drawHouse();
            
            let isAnyStoneSliding = false;
            
            stones.forEach(stone => {
                if (stone.isSliding) {
                    isAnyStoneSliding = true;
                    // Apply friction to slow down the stone
                    stone.vx *= FRICTION;
                    stone.vy *= FRICTION;
                    
                    // Update position
                    stone.x += stone.vx;
                    stone.y += stone.vy;
                    
                    // Stop the stone if it's slow enough
                    if (Math.hypot(stone.vx, stone.vy) < 0.1) {
                        stone.isSliding = false;
                        stone.vx = 0;
                        stone.vy = 0;
                    }
                }
                drawStone(stone);
            });
            
            drawCurrentThrowStone();
            drawAimingLine();

            // Check if all stones have stopped sliding
            if (gameState === 'sliding' && !isAnyStoneSliding) {
                endTurn();
            }

            // Request the next frame to continue the animation
            requestAnimationFrame(update);
        }
        
        function startTurn() {
            gameState = 'aiming';
            updateStatus();
        }
        
        function endTurn() {
            totalStonesThrown++;
            stonesThrownThisTurn++;
            
            // Switch teams
            if (currentTeam === 'red') {
                currentTeam = 'blue';
            } else {
                currentTeam = 'red';
                // After blue throws, an "end" is over.
                if (stonesThrownThisTurn >= STONES_PER_TEAM * 2) {
                    calculateScore();
                    return; // Stop the turn progression
                }
            }

            if (totalStonesThrown >= STONES_PER_TEAM * 2) {
                 calculateScore();
            } else {
                startTurn();
            }
        }

        function calculateScore() {
            gameState = 'scoring';
            let closestStone = null;
            let minDistance = Infinity;

            stones.forEach(stone => {
                const distance = Math.hypot(stone.x - HOUSE_CENTER_X, stone.y - HOUSE_CENTER_Y);
                // Check if the stone is in the house
                if (distance < 80 + STONE_RADIUS) { // 80 is the outer ring radius
                     if (distance < minDistance) {
                        minDistance = distance;
                        closestStone = stone;
                    }
                }
            });

            if (closestStone) {
                if (closestStone.color === COLOR_RED) {
                    score.red++;
                    statusEl.textContent = `Red scores 1 point! Final Score: Red ${score.red} - Blue ${score.blue}`;
                } else {
                    score.blue++;
                    statusEl.textContent = `Blue scores 1 point! Final Score: Red ${score.red} - Blue ${score.blue}`;
                }
            } else {
                statusEl.textContent = `No score this end. Final Score: Red ${score.red} - Blue ${score.blue}`;
            }

            scoreRedEl.textContent = score.red;
            scoreBlueEl.textContent = score.blue;
            gameState = 'gameover';
            statusEl.textContent += " Press 'New Game' to play again.";
        }
        
        function resetGame() {
            stones = [];
            currentTeam = 'red';
            stonesThrownThisTurn = 0;
            totalStonesThrown = 0;
            score = { red: 0, blue: 0 };
            scoreRedEl.textContent = '0';
            scoreBlueEl.textContent = '0';
            startTurn();
        }
        
        function updateStatus() {
            let teamName = currentTeam.charAt(0).toUpperCase() + currentTeam.slice(1);
            let stonesLeft = STONES_PER_TEAM - Math.floor(totalStonesThrown / 2);
            statusEl.innerHTML = `
                <div class="team-indicator">
                    <div class="color-box" style="background-color:${currentTeam === 'red' ? COLOR_RED : COLOR_BLUE};"></div>
                    <span>${teamName}'s Turn (${stonesLeft} stones left)</span>
                </div>
            `;
        }

        // --- Event Listeners ---

        canvas.addEventListener('mousedown', (e) => {
            if (gameState !== 'aiming') return;
            isAiming = true;
            aimStart = { x: e.offsetX, y: e.offsetY };
            aimEnd = { x: e.offsetX, y: e.offsetY };
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isAiming) return;
            aimEnd = { x: e.offsetX, y: e.offsetY };
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!isAiming) return;
            isAiming = false;
            gameState = 'sliding';
            statusEl.textContent = 'Sliding...';
            
            // Calculate velocity based on drag distance and direction
            // The further you pull back, the stronger the shot
            const powerMultiplier = 0.15;
            const vx = (aimStart.x - aimEnd.x) * powerMultiplier;
            const vy = (aimStart.y - aimEnd.y) * powerMultiplier;
            
            // Create the new stone
            stones.push({
                x: START_X,
                y: canvas.height / 2,
                vx: vx,
                vy: vy,
                color: currentTeam === 'red' ? COLOR_RED : COLOR_BLUE,
                isSliding: true
            });
        });

        resetButton.addEventListener('click', resetGame);

        // --- Start the Game ---
        resetGame(); // Initialize the first game state
        update(); // Start the animation loop

    </script>
</body>
</html>
"""

def create_and_launch_game():
    """Writes the HTML file, starts a server, and opens the browser."""
    print("--------------------------------------")
    print("--- Python Local Game Launcher ---")
    print("--------------------------------------")

    # 1. Create the HTML file in the current directory
    try:
        with open(FILENAME, "w", encoding="utf-8") as f:
            f.write(HTML_CONTENT)
        print(f"✅ Successfully created game file: {FILENAME}")
    except IOError as e:
        print(f"❌ Error: Could not write file to disk. {e}")
        return

    # 2. Set up and start a simple local web server
    Handler = http.server.SimpleHTTPRequestHandler
    httpd = None
    current_port = PORT
    max_retries = 10

    for i in range(max_retries):
        try:
            httpd = socketserver.TCPServer(("", current_port), Handler)
            print(f"✅ Server started successfully on port {current_port}.")
            print(f"➡️  Serving at: http://localhost:{current_port}")
            break
        except OSError as e:
            if "address already in use" in str(e).lower() or \
               "only one usage of each socket address" in str(e).lower():
                print(f"⚠️ Port {current_port} is in use. Trying next port...")
                current_port += 1
            else:
                print(f"\n❌ Critical Error: Could not start the server.")
                print(f"   Error details: {e}")
                if os.path.exists(FILENAME):
                    os.remove(FILENAME)
                    print(f"🧹 Cleaned up {FILENAME}.")
                return

        if i == max_retries - 1 and httpd is None:
            print(f"\n❌ Critical Error: Could not find an available port after {max_retries} attempts.")
            print(f"   Please check your system for programs using ports {PORT}-{current_port-1}.")
            if os.path.exists(FILENAME):
                os.remove(FILENAME)
                print(f"🧹 Cleaned up {FILENAME}.")
            return

    if httpd is None:
        print(f"\n❌ Critical Error: Failed to initialize the server (httpd is None).")
        if os.path.exists(FILENAME):
            os.remove(FILENAME)
            print(f"🧹 Cleaned up {FILENAME}.")
        return

    try:
        with httpd:
            game_url = f"http://localhost:{current_port}/{FILENAME}"
            
            print(f"🚀 Launching game in your browser...")
            webbrowser.open_new_tab(game_url)

            print("\n--------------------------------------")
            print("  The game is now running in your browser.")
            print("  Keep this window open to keep the server running.")
            print("  Press CTRL+C here to stop the server.")
            print("--------------------------------------\n")
            
            httpd.serve_forever()

    except OSError as e:
        print(f"\n❌ Critical Error encountered during server operation or browser launch.")
        print(f"   Error details: {e}")
    except KeyboardInterrupt:
        print("\n--------------------------------------")
        print("🛑 Server stopped by user.")
        print("   Closing the application. Goodbye!")
        print("--------------------------------------")
    finally:
        if os.path.exists(FILENAME):
            os.remove(FILENAME)
            print(f"🧹 Cleaned up {FILENAME}.")

if __name__ == "__main__":
    create_and_launch_game()
