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
const START_X = 150; // Increased from 100 for more aiming room
const STONE_RADIUS = 15;
const FRICTION = 0.98; // closer to 1 means less friction
const STONES_PER_TEAM = 4;

// Constants for new game features (moved from bottom)
const HOG_LINE_THICKNESS = 4; // px
const HOG_LINE_TO_TEE_PX = 220; // Adjusted for gameplay feel on this canvas size
const HOG_LINE_X_FAR = HOUSE_CENTER_X - HOG_LINE_TO_TEE_PX;
const PLAY_AREA_START_X = START_X - (STONE_RADIUS * 2); // Where the hack might be visually
const HOG_LINE_X_NEAR = PLAY_AREA_START_X + HOG_LINE_TO_TEE_PX;
const CURL_SENSITIVITY = 0.02; // Adjust for how much mouse movement affects curl

// Colors
const COLOR_RED = '#e53e3e';
const COLOR_BLUE = '#4299e1';
const COLOR_ICE = '#ffffff';
const COLOR_HOUSE_BLUE = '#a0deff';
const COLOR_HOUSE_RED = '#ffc0c0';
const COLOR_BUTTON = '#f6ad55';
const HOG_LINE_COLOR = '#3182ce'; // A distinct blue

// Game state variables
let stones = [];
let currentTeam = 'red';
// let stonesThrownThisTurn = 0; // Replaced by redStonesThrownThisEnd/blueStonesThrownThisEnd
// let totalStonesThrown = 0; // Replaced by sum of red/blue stones thrown this end for end logic

let score = { red: 0, blue: 0 };
let gameState = 'aimingPower'; // 'aimingPower', 'aimingCurl', 'sliding', 'scoring', 'gameover'

// Input/State Variables for Aiming
let isSettingPower = false; // True when mouse is down for power setting phase
let powerAimStart = { x: 0, y: 0 }; // Mouse position when power aim started
let powerAimEnd = { x: 0, y: 0 };   // Current mouse position for power aiming

let isSettingCurl = false; // True when setting curl (after power is locked)
let curlAimStartX = 0; // Mouse X position when curl setting started
let currentCurlInput = 0; // Raw curl input from mouse X, will be normalized e.g. to -1, 0, 1

let lockedPower = 0;    // Power determined in aimingPower state
let lockedAngle = 0;    // Angle determined in aimingPower state

// Constants for Curl
const MAX_CURL_MOUSE_DRAG = 150; // Max pixels of horizontal mouse drag for full curl effect
const CURL_EFFECT_SCALE = 0.001; // Scales the raw curl input to a spin value for the stone
const LATERAL_CURL_FORCE = 0.03; // Base magnitude of the lateral force due to curl
const POWER_MULTIPLIER = 0.06; // Reduced from 0.15 to slow down the stone
// Existing multiplier for power

// Constants for Sweeping
const SWEEP_FRICTION_REDUCTION_EFFECT = 0.002; // Increases effective friction factor towards 1.0
const SWEEP_CURL_INFLUENCE_EFFECT = 0.005; // Small lateral nudge force from sweeping
const CURL_INPUT_DEAD_ZONE = 20; // If absolute mouse curl input is less than this, spinDirection is 0

// Sweeping State
let isSweepingLeft = false; // 'a' key
let isSweepingRight = false; // 'd' key
let activeSweepingStone = null; // The stone currently being affected by sweeping

// State for stones thrown by each team in the current end
let redStonesThrownThisEnd = 0;
let blueStonesThrownThisEnd = 0;

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

    // Draw Hog Lines
    ctx.fillStyle = HOG_LINE_COLOR;
    // Far Hog Line
    ctx.fillRect(HOG_LINE_X_FAR - HOG_LINE_THICKNESS / 2, 0, HOG_LINE_THICKNESS, canvas.height);
    // Near Hog Line (visual only for now, rule is for player release)
    ctx.fillRect(HOG_LINE_X_NEAR - HOG_LINE_THICKNESS / 2, 0, HOG_LINE_THICKNESS, canvas.height);
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
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';

    if (gameState === 'aimingPower' && isSettingPower) {
        const dx = powerAimEnd.x - powerAimStart.x;
        const dy = powerAimEnd.y - powerAimStart.y;

        ctx.beginPath();
        ctx.moveTo(START_X, canvas.height / 2);
        // The line shows the inverse of the drag, like pulling back a slingshot
        ctx.lineTo(START_X - dx, canvas.height / 2 - dy);
        ctx.stroke();

        const powerValue = Math.hypot(dx, dy) * POWER_MULTIPLIER;
        // Display power dynamically in status element or on canvas
        // statusEl.textContent = `Power: ${(powerValue / (POWER_MULTIPLIER * 10)).toFixed(0)}%`; // Needs better scaling for %
        let powerPercentage = (Math.hypot(dx, dy) / 150) * 100; // Assume 150px drag is 100% power
        powerPercentage = Math.min(100, Math.max(0, powerPercentage));
        statusEl.textContent = `Drag to set Power: ${powerPercentage.toFixed(0)}%. Release to lock.`;


    } else if (gameState === 'aimingCurl') {
        // Draw the locked power and angle line
        const endX = START_X + Math.cos(lockedAngle) * (lockedPower / POWER_MULTIPLIER); // Approximate line length based on power
        const endY = canvas.height / 2 + Math.sin(lockedAngle) * (lockedPower / POWER_MULTIPLIER);

        ctx.beginPath();
        ctx.moveTo(START_X, canvas.height / 2);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Placeholder for Ghosted Arc for Curl Preview (to be implemented next)
        // For now, just indicate curl direction in status
        let curlDir = "Straight";
        if (currentCurlInput > 20) curlDir = "Right (Clockwise)";
        else if (currentCurlInput < -20) curlDir = "Left (Counter-Clockwise)";
        statusEl.textContent = `Power Locked. Curl: ${curlDir}. Click to throw.`;

        // Ghosted Arc Preview
        drawProjectedPath(START_X, canvas.height / 2, lockedPower, lockedAngle, currentCurlInput);
    }
}

function drawProjectedPath(startX, startY, initialPower, initialAngle, curlInput) {
    const numSteps = 60; // Number of simulation steps for the projection
    const dt = 1; // Time step multiplier for each simulation segment (arbitrary, scales segment length)

    let simX = startX;
    let simY = startY;
    let simVx = Math.cos(initialAngle) * initialPower;
    let simVy = Math.sin(initialAngle) * initialPower;

    let simSpinDirection = curlInput / MAX_CURL_MOUSE_DRAG;
    simSpinDirection = Math.max(-1, Math.min(1, simSpinDirection));
    if (Math.abs(curlInput) < CURL_INPUT_DEAD_ZONE) { // Using same dead zone as in stone creation
        simSpinDirection = 0;
    }

    const initialSimSpeed = Math.hypot(simVx, simVy); // For dynamic curl effect if needed

    ctx.beginPath();
    ctx.moveTo(simX, simY);
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.4)'; // Blueish, semi-transparent
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); // Dashed line

    for (let i = 0; i < numSteps; i++) {
        // Apply friction (same as in main update)
        simVx *= FRICTION;
        simVy *= FRICTION;

        // Apply curl physics (simplified, same as in main update)
        if (simSpinDirection !== 0) {
            const currentSimSpeed = Math.hypot(simVx, simVy);
            if (currentSimSpeed > 0.15) {
                const normVx = simVx / currentSimSpeed;
                const normVy = simVy / currentSimSpeed;
                const actualCurlForce = LATERAL_CURL_FORCE; // Use the same constant

                const ax_curl_sim = actualCurlForce * simSpinDirection * normVy;
                const ay_curl_sim = -actualCurlForce * simSpinDirection * normVx;

                simVx += ax_curl_sim;
                simVy += ay_curl_sim;
            }
        }

        // Update position for this step
        // The * dt here means each step in simVx is "velocity per dt"
        // If simVx is already "change per frame/step", then dt is 1.
        simX += simVx * dt;
        simY += simVy * dt;

        ctx.lineTo(simX, simY);

        if (Math.hypot(simVx, simVy) < 0.1) { // Stop if simulation slows too much
            break;
        }
    }

    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
    ctx.lineWidth = 3; // Reset line width to default for other drawing
}

function drawCurrentThrowStone() {
    // Draw the stone to be thrown if in any aiming phase
    if (gameState === 'aimingPower' || gameState === 'aimingCurl') {
        drawStone({
            x: START_X,
            y: canvas.height / 2,
            color: currentTeam === 'red' ? COLOR_RED : COLOR_BLUE,
            // No vx, vy, or isSliding property for the preview stone
        });
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
            let currentFriction = FRICTION;
            let appliedSweepCurlInfluence = {x: 0, y: 0};

            // Check for sweeping effects ONLY on the activeSweepingStone
            if (activeSweepingStone === stone && stone.isSliding) {
                if (isSweepingLeft || isSweepingRight) {
                    // Reduce overall friction
                    currentFriction += SWEEP_FRICTION_REDUCTION_EFFECT; // Make friction closer to 1.0
                    currentFriction = Math.min(0.999, currentFriction); // Cap to prevent acceleration, ensure some friction

                    // Influence curl: Sweeping generally makes the stone go straighter and farther.
                    // A simple model: sweeping slightly reduces the existing curl or nudges straight.
                    // If stone has spin, sweeping can counteract it slightly.
                    if (stone.spinDirection !== 0) {
                        // Reduce the effective LATERAL_CURL_FORCE when sweeping
                        // This is one way. Another is to apply a counter-force or a nudge.
                        // Let's try a nudge. 'a' (left) nudges left, 'd' (right) nudges right.
                        // The nudge should be perpendicular to stone's velocity.
                        const currentSpeed = Math.hypot(stone.vx, stone.vy);
                        if (currentSpeed > 0.1) {
                            const normVx = stone.vx / currentSpeed; // Normalized velocity
                            const normVy = stone.vy / currentSpeed;

                            // Nudge direction (perpendicular to velocity)
                            // Left nudge: (-normVy, normVx)
                            // Right nudge: (normVy, -normVx)
                            if (isSweepingLeft) { // Nudge left relative to stone's path
                                appliedSweepCurlInfluence.x = -normVy * SWEEP_CURL_INFLUENCE_EFFECT;
                                appliedSweepCurlInfluence.y = normVx * SWEEP_CURL_INFLUENCE_EFFECT;
                            } else if (isSweepingRight) { // Nudge right relative to stone's path
                                appliedSweepCurlInfluence.x = normVy * SWEEP_CURL_INFLUENCE_EFFECT;
                                appliedSweepCurlInfluence.y = -normVx * SWEEP_CURL_INFLUENCE_EFFECT;
                            }
                            // If both sweeping, effects could cancel or double - for now, assume they don't press both.
                            // Or, if both, maybe just friction reduction applies.
                            // Current logic: if either is true, friction is reduced. If one is specifically true, nudge.
                        }
                    }
                }
            }

            // Apply friction to slow down the stone
            stone.vx *= currentFriction;
            stone.vy *= currentFriction;

            // Apply curl physics if the stone has spin and is moving
            if (stone.spinDirection !== 0 && typeof stone.spinDirection === 'number') {
                const currentSpeed = Math.hypot(stone.vx, stone.vy);
                if (currentSpeed > 0.15) { // Only apply curl if moving significantly
                    // Curl effect increases as stone slows down.
                    // Let's use a factor that is larger for smaller speeds.
                    // Example: (1 - currentSpeed / stone.initialSpeed) can scale the force.
                    // Ensure stone.initialSpeed is set when stone is created.
                    let curlMagnitudeFactor = 1;
                    if (stone.initialSpeed && stone.initialSpeed > 0) {
                        // Factor increases from 0 (at initialSpeed) to 1 (as speed approaches 0)
                        // We want more curl as it slows, so perhaps (1 - (currentSpeed / stone.initialSpeed))
                        // but this makes it 0 at start. Let's try simpler first:
                        // Make curl stronger when currentSpeed is, say, less than 30% of initialSpeed
                        // or simply make LATERAL_CURL_FORCE a bit higher.
                        // A common model: curl is proportional to v_angular / v_linear.
                        // As v_linear drops, fixed v_angular (spin) means more curl.
                        // Our LATERAL_CURL_FORCE is currently constant.
                        // To make it more pronounced as it slows, we can increase its effect.
                        // E.g. curlForce = BASE_LATERAL_CURL_FORCE * (1 + (1 - currentSpeed / stone.initialSpeed) * 2)
                        // This would make the force up to 3x stronger as it stops.
                        // For now, constant LATERAL_CURL_FORCE. It's applied each frame.
                    }

                    const normVx = stone.vx / currentSpeed;
                    const normVy = stone.vy / currentSpeed;

                    // ax_curl is perpendicular to vy, ay_curl is perpendicular to vx
                    // spinDirection = 1 (Clockwise/Right Handle): Stone curls to its right.
                    // If moving mainly +X (normVx approx 1, normVy approx 0), right is +Y. So ay_curl should be positive.
                    // ay_curl = LATERAL_CURL_FORCE * stone.spinDirection * normVx
                    // ax_curl = -LATERAL_CURL_FORCE * stone.spinDirection * normVy

                    const actualCurlForce = LATERAL_CURL_FORCE; // Can be made dynamic later

                    const ax_curl = actualCurlForce * stone.spinDirection * normVy; // If vy is large, affects x more
                    const ay_curl = -actualCurlForce * stone.spinDirection * normVx; // If vx is large, affects y more

                    stone.vx += ax_curl;
                    stone.vy += ay_curl;
                }
            }

            // Apply sweeping nudge if any
            stone.vx += appliedSweepCurlInfluence.x;
            stone.vy += appliedSweepCurlInfluence.y;

            // Update position
            stone.x += stone.vx;
            stone.y += stone.vy;

            // Stop the stone if it's slow enough
            if (Math.hypot(stone.vx, stone.vy) < 0.1) {
                stone.isSliding = false;
                stone.vx = 0;
                stone.vy = 0;

                // Check for Far Hog Line violation when stone stops
                // A stone must fully cross the far hog line.
                // Its leading edge (stone.x + STONE_RADIUS for rightward moving stone) must be > HOG_LINE_X_FAR.
                // If its trailing edge (stone.x - STONE_RADIUS) < HOG_LINE_X_FAR, it's not fully across.
                // The rule: "A stone must be clear of the (far) hog line for any subsequent stone to be in play."
                // Standard interpretation: The stone must *fully cross* it.
                // So, stone.x - STONE_RADIUS >= HOG_LINE_X_FAR means it's fully past.
                // If stone.x + STONE_RADIUS < HOG_LINE_X_FAR, it clearly hasn't reached it / crossed it enough.
                // Let's use: if the *entire stone* (stone.x + STONE_RADIUS) is not beyond HOG_LINE_X_FAR, it's out.
                // No, the rule is it must *fully cross*. So its *trailing edge* (stone.x - STONE_RADIUS) must be beyond HOG_LINE_X_FAR.
                // If stone.x - STONE_RADIUS < HOG_LINE_X_FAR, it's a violation.
                // However, if it stops *on* the line, it's often removed.
                // Let's use: if any part of the stone is before or on the far hog line (stone.x + STONE_RADIUS <= HOG_LINE_X_FAR) it's out.
                // No, simpler: if its center doesn't cross, it's definitely out. If its center does, but not fully, it's out.
                // Official: "A stone which does not completely clear the hog line at the scoring end is removed from play"
                // "Completely clear" means stone.x - STONE_RADIUS (trailing edge) > HOG_LINE_X_FAR.
                // So, if stone.x - STONE_RADIUS <= HOG_LINE_X_FAR, it is removed.
                if ((stone.x - STONE_RADIUS) <= HOG_LINE_X_FAR) {
                    stone.isOutOfPlay = true; // Mark for removal
                    console.log(`Stone ${stone.id} violated far hog line.`);
                }


                if (activeSweepingStone === stone) {
                    activeSweepingStone = null; // Clear active sweeping stone if it's this one
                    isSweepingLeft = false; // Stop sweeping indication
                    isSweepingRight = false;
                }
            }
        }
        // Draw stone unless it's marked out of play from hog line
        if (!stone.isOutOfPlay) {
            drawStone(stone);
        }
    });

    drawCurrentThrowStone();
    drawAimingLine();

    // Stone-to-stone collision detection and response
    for (let i = 0; i < stones.length; i++) {
        for (let j = i + 1; j < stones.length; j++) {
            const stone1 = stones[i];
            const stone2 = stones[j];

            const dx = stone2.x - stone1.x;
            const dy = stone2.y - stone1.y;
            const distance = Math.hypot(dx, dy);

            if (distance < STONE_RADIUS * 2) { // Collision detected
                // Basic collision response: A simple model where stones just stop or bounce off directly.
                // More advanced: conservation of momentum.

                // Normal vector
                const nx = dx / distance;
                const ny = dy / distance;

                // Tangent vector
                const tx = -ny;
                const ty = nx;

                // Dot product tangent
                const dpTan1 = stone1.vx * tx + stone1.vy * ty;
                const dpTan2 = stone2.vx * tx + stone2.vy * ty;

                // Dot product normal
                const dpNorm1 = stone1.vx * nx + stone1.vy * ny;
                const dpNorm2 = stone2.vx * nx + stone2.vy * ny;

                // Conservation of momentum in 1D (for normal direction)
                // Assuming equal mass for stones
                const m1 = (dpNorm1 * (STONE_RADIUS - STONE_RADIUS) + 2 * STONE_RADIUS * dpNorm2) / (STONE_RADIUS + STONE_RADIUS); // simplified: dpNorm2
                const m2 = (dpNorm2 * (STONE_RADIUS - STONE_RADIUS) + 2 * STONE_RADIUS * dpNorm1) / (STONE_RADIUS + STONE_RADIUS); // simplified: dpNorm1
                // For equal masses, they just swap normal velocities:
                // const m1 = dpNorm2;
                // const m2 = dpNorm1;
                // This is for 1D. For 2D elastic collision of equal mass spheres:
                // v1' = v1 - dot(v1-v2, x1-x2) / ||x1-x2||^2 * (x1-x2)
                // v2' = v2 - dot(v2-v1, x2-x1) / ||x2-x1||^2 * (x2-x1)

                // Simpler elastic collision for circles of equal mass:
                // Velocity components along the normal are exchanged.
                // Velocity components along the tangent remain unchanged.

                stone1.vx = tx * dpTan1 + nx * dpNorm2;
                stone1.vy = ty * dpTan1 + ny * dpNorm2;
                stone2.vx = tx * dpTan2 + nx * dpNorm1;
                stone2.vy = ty * dpTan2 + ny * dpNorm1;

                // Prevent sticking: move stones apart slightly along the normal
                const overlap = STONE_RADIUS * 2 - distance;
                stone1.x -= overlap / 2 * nx;
                stone1.y -= overlap / 2 * ny;
                stone2.x += overlap / 2 * nx;
                stone2.y += overlap / 2 * ny;

                // Ensure both are marked as sliding if they weren't before collision but now have velocity
                if (Math.hypot(stone1.vx, stone1.vy) > 0.01) stone1.isSliding = true;
                if (Math.hypot(stone2.vx, stone2.vy) > 0.01) stone2.isSliding = true;
                 isAnyStoneSliding = true; // Ensure game continues if collision makes a stone move
            }
        }
    }

    // Remove stones out of bounds OR that violated hog line
    stones = stones.filter(stone => {
        if (stone.isOutOfPlay) { // Marked by hog line rule
            console.log(`Stone ${stone.id} removed due to hog line violation.`);
            return false;
        }
        const outOfBounds = stone.x < -STONE_RADIUS || stone.x > canvas.width + STONE_RADIUS ||
                           stone.y < -STONE_RADIUS || stone.y > canvas.height + STONE_RADIUS;
        if (outOfBounds) {
            console.log(`Stone ${stone.id} removed (out of bounds).`);
            return false; // Remove stone
        }
        return true; // Keep stone
    });


    // Check if all stones have stopped sliding
    if (gameState === 'sliding' && !isAnyStoneSliding) {
        // One final check to ensure no stone is marked isSliding if its speed is negligible
        stones.forEach(s => {
            if (s.isSliding && Math.hypot(s.vx, s.vy) < 0.1) {
                s.isSliding = false;
                s.vx = 0; s.vy = 0;
            }
        });
        // Re-evaluate isAnyStoneSliding after this cleanup
        isAnyStoneSliding = stones.some(s => s.isSliding);
        if (!isAnyStoneSliding) {
            endTurn();
        }
    }

    // Request the next frame to continue the animation
    requestAnimationFrame(update);
}

function startTurn() { // This function should set the game to the beginning of a turn
    gameState = 'aimingPower'; // Start with power aiming
    // currentCurlInput = 0; // Reset curl input if any was pending
    // lockedPower = 0;
    // lockedAngle = 0;
    // isSettingCurl = false; // Ensure these are reset if a turn is aborted and restarted
    // isSettingPower = false;
    updateStatus(); // Update UI
}

function endTurn() { // Called when all stones stop sliding after a throw
    // This function now decides if the end is over or if it's the next team's turn.

    // Check if all stones for the current end have been thrown by both teams
    if (redStonesThrownThisEnd >= STONES_PER_TEAM && blueStonesThrownThisEnd >= STONES_PER_TEAM) {
        calculateScore(); // All stones thrown, proceed to scoring
        return;
    }

    // Determine next team if the end is not over
    if (currentTeam === 'red') { // Red just played
        if (blueStonesThrownThisEnd < STONES_PER_TEAM) {
            currentTeam = 'blue';
        } else if (redStonesThrownThisEnd < STONES_PER_TEAM) {
            // Blue has thrown all, but Red has more. Red continues. (Standard curling: alternate)
            // This situation (one team throws all, other still has stones) is not standard continuous play.
            // Standard play: Red throws, then Blue, until both thrown STONES_PER_TEAM.
            // The current logic in mousedown allows a team to keep throwing if other is out.
            // Let's assume strict alternation for now. If Red just threw, it's Blue's turn if they have stones.
            // If Blue has no stones, but Red does, it's an issue with how turns are managed or game setup.
            // For now, just switch if possible.
             currentTeam = 'blue'; // Should be blue if they have stones
        }
        // If blue has no stones left, and red also has no more, handled by the check above.
    } else { // Blue just played
        if (redStonesThrownThisEnd < STONES_PER_TEAM) {
            currentTeam = 'red';
        } else if (blueStonesThrownThisEnd < STONES_PER_TEAM) {
            // Red has thrown all, Blue continues.
            currentTeam = 'red'; // Should be red if they have stones
        }
    }

    gameState = 'aimingPower'; // Set state for the next throw
    activeSweepingStone = null; // Clear any active sweeper at end of sliding phase / turn switch
    isSweepingLeft = false;
    isSweepingRight = false;
    updateStatus();
}

function calculateScore() {
    gameState = 'scoring';
    updateStatus(); // Show "Scoring..."

    const stonesInHouse = stones.filter(stone => {
        // Ensure stone is not marked out of play by hog line already
        if (stone.isOutOfPlay) return false;

        const distance = Math.hypot(stone.x - HOUSE_CENTER_X, stone.y - HOUSE_CENTER_Y);
        // A stone is in the house if any part of it is over the outer house line.
        // HOUSE_OUTER_RADIUS is 80.
        if (distance <= 80 + STONE_RADIUS) {
            stone.distanceToButton = distance; // Store for sorting
            return true;
        }
        return false;
    });

    if (stonesInHouse.length === 0) {
        statusEl.textContent = `No stones in the house. No score this end. Final: Red ${score.red} - Blue ${score.blue}`;
        scoreRedEl.textContent = score.red;
        scoreBlueEl.textContent = score.blue;
        gameState = 'gameover';
        statusEl.textContent += " Press 'New Game' to play again.";
        return;
    }

    // Sort stones by distance to the button, closest first
    stonesInHouse.sort((a, b) => a.distanceToButton - b.distanceToButton);

    const shotRock = stonesInHouse[0];
    const scoringTeamColor = shotRock.color; // This is the COLOR_RED or COLOR_BLUE
    const scoringTeamName = scoringTeamColor === COLOR_RED ? 'red' : 'blue';
    const opponentColor = scoringTeamColor === COLOR_RED ? COLOR_BLUE : COLOR_RED;

    let pointsThisEnd = 0;
    for (const stone of stonesInHouse) {
        if (stone.color === scoringTeamColor) {
            pointsThisEnd++;
        } else {
            // This is the first opponent stone encountered, stop counting for the scoring team
            break;
        }
    }

    if (pointsThisEnd > 0) {
        if (scoringTeamName === 'red') {
            score.red += pointsThisEnd;
        } else {
            score.blue += pointsThisEnd;
        }
        statusEl.textContent = `${scoringTeamName.charAt(0).toUpperCase() + scoringTeamName.slice(1)} scores ${pointsThisEnd} point(s)! Final Score: Red ${score.red} - Blue ${score.blue}`;
    } else {
        // This case should ideally not be reached if stonesInHouse.length > 0,
        // as the shotRock itself guarantees at least one stone for its team.
        // However, if somehow it happens (e.g. all stones are exactly tied and of different teams - not possible with this sort)
        statusEl.textContent = `No score this end (complex tie or error). Final: Red ${score.red} - Blue ${score.blue}`;
    }

    scoreRedEl.textContent = score.red;
    scoreBlueEl.textContent = score.blue;
    gameState = 'gameover';
    statusEl.textContent += " Press 'New Game' to play again.";
}

function resetGame() {
    stones = [];
    currentTeam = 'red'; // Red always starts (can be changed later)

    redStonesThrownThisEnd = 0;
    blueStonesThrownThisEnd = 0;

    score = { red: 0, blue: 0 }; // Reset score for a new game
    scoreRedEl.textContent = '0';
    scoreBlueEl.textContent = '0';

    gameState = 'aimingPower'; // Initial game state

    // Reset aiming mechanism variables
    isSettingPower = false;
    isSettingCurl = false;
    powerAimStart = { x: 0, y: 0 };
    powerAimEnd = { x: 0, y: 0 };
    lockedPower = 0;
    lockedAngle = 0;
    curlAimStartX = 0;
    currentCurlInput = 0;

    updateStatus(); // Update the display
    // requestAnimationFrame(update); // Ensure canvas is redrawn, update() handles this
}

function updateStatus() {
    let teamName = currentTeam.charAt(0).toUpperCase() + currentTeam.slice(1);
    let stonesLeftForCurrentTeam = 0;
    if (currentTeam === 'red') {
        stonesLeftForCurrentTeam = STONES_PER_TEAM - redStonesThrownThisEnd;
    } else {
        stonesLeftForCurrentTeam = STONES_PER_TEAM - blueStonesThrownThisEnd;
    }

    // Default status message
    let statusText = `
        <div class="team-indicator">
            <div class="color-box" style="background-color:${currentTeam === 'red' ? COLOR_RED : COLOR_BLUE};"></div>
            <span>${teamName}'s Turn (${stonesLeftForCurrentTeam} stones left this end)</span>
        </div>`;

    if (gameState === 'aimingPower') {
        if (stonesLeftForCurrentTeam <= 0) {
            statusText = `${teamName} has no stones left. Waiting for opponent.`;
            // Potentially auto-switch turn here if the other team still has stones
            // This is partially handled in endTurn and mousedown, but can be centralized.
        } else {
             statusText = `
                <div class="team-indicator">
                    <div class="color-box" style="background-color:${currentTeam === 'red' ? COLOR_RED : COLOR_BLUE};"></div>
                    <span>${teamName}: Drag for Power (${stonesLeftForCurrentTeam} left). Release to lock.</span>
                </div>`;
        }
    } else if (gameState === 'aimingCurl') {
        let curlDir = "Straight";
        if (currentCurlInput > 20) curlDir = "Right (Clockwise)";
        else if (currentCurlInput < -20) curlDir = "Left (Counter-Clockwise)";
        statusText = `
            <div class="team-indicator">
                 <div class="color-box" style="background-color:${currentTeam === 'red' ? COLOR_RED : COLOR_BLUE};"></div>
                <span>${teamName}: Power Locked. Set Curl (${curlDir}). Click to throw.</span>
            </div>`;
    } else if (gameState === 'sliding') {
        statusText = "Sliding...";
    } else if (gameState === 'scoring') {
        // Score calculation message is set directly in calculateScore()
        return; // Avoid overwriting score message
    } else if (gameState === 'gameover') {
        // Game over message is set in calculateScore()
        return; // Avoid overwriting game over message
    }

    statusEl.innerHTML = statusText;
}


// --- Event Listeners ---

canvas.addEventListener('mousedown', (e) => {
    if (gameState === 'aimingPower') {
        // Check if current team has stones left
        const stonesLeft = currentTeam === 'red' ? STONES_PER_TEAM - redStonesThrownThisEnd : STONES_PER_TEAM - blueStonesThrownThisEnd;
        if (stonesLeft <= 0) {
            updateStatus(); // Update status to show no stones left or switch turn
            return;
        }

        isSettingPower = true;
        powerAimStart = { x: e.offsetX, y: e.offsetY };
        powerAimEnd = { x: e.offsetX, y: e.offsetY };
        statusEl.textContent = "Drag to set power and line. Release to lock power.";

    } else if (gameState === 'aimingCurl') {
        // Finalize throw with locked power, angle, and current curl
        isSettingCurl = false; // Stop curl input phase

        // Calculate initial velocity components based on lockedPower and lockedAngle
        const vx = Math.cos(lockedAngle) * lockedPower;
        const vy = Math.sin(lockedAngle) * lockedPower;

        // Normalize curlInput to spinDirection (e.g., -1, 0, 1, or a continuous value)
        // Positive currentCurlInput for clockwise (typically, stone curls right), negative for counter-clockwise (curls left)
        // Make spinDirection proportional to curl input, ranging from -1 to 1.
        let spinDirection = currentCurlInput / MAX_CURL_MOUSE_DRAG;
        spinDirection = Math.max(-1, Math.min(1, spinDirection)); // Clamp between -1 and 1

        // Add a dead zone for very small curl inputs to make it easier to throw straight
        const CURL_INPUT_DEAD_ZONE = 20; // If absolute curl input is less than this, consider it no spin
        if (Math.abs(currentCurlInput) < CURL_INPUT_DEAD_ZONE) {
            spinDirection = 0;
        }

        const newStone = {
            x: START_X,
            y: canvas.height / 2,
            vx: vx,
            vy: vy,
            color: currentTeam === 'red' ? COLOR_RED : COLOR_BLUE,
            isSliding: true,
            id: `stone-${stones.length}`, // Use current length of stones array for a simple unique ID
            spinDirection: spinDirection, // Store the spin
            originalVx: vx, // Store initial speed for curl calculation if needed
            initialSpeed: lockedPower, // Store the initial power/speed
            team: currentTeam // Associate stone with the team that threw it
        };
        stones.push(newStone);
        activeSweepingStone = newStone; // Set this new stone as the one that can be swept

        if (currentTeam === 'red') {
            redStonesThrownThisEnd++;
        } else {
            blueStonesThrownThisEnd++;
        }

        gameState = 'sliding';
        statusEl.textContent = 'Sliding...';
        updateStatus(); // Update score/turn info

        // Reset aiming variables for the next shot
        currentCurlInput = 0;
        lockedPower = 0;
        lockedAngle = 0;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (gameState === 'aimingPower' && isSettingPower) {
        powerAimEnd = { x: e.offsetX, y: e.offsetY };
        // Power display will be handled by drawAimingLine
    } else if (gameState === 'aimingCurl' && isSettingCurl) {
        // currentCurlInput is based on horizontal movement since curl setting started
        currentCurlInput = e.offsetX - curlAimStartX;
        // Clamp curl input
        currentCurlInput = Math.max(-MAX_CURL_MOUSE_DRAG, Math.min(MAX_CURL_MOUSE_DRAG, currentCurlInput));
        // Status update for curl can be here or in drawAimingLine/update
        // statusEl.textContent = `Curl: ${currentCurlInput.toFixed(0)}`;
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (gameState === 'aimingPower' && isSettingPower) {
        isSettingPower = false; // Power setting phase ends

        // Calculate power and angle from the drag
        const dx = powerAimStart.x - powerAimEnd.x; // Reversed for "pull back" mechanic
        const dy = powerAimStart.y - powerAimEnd.y; // Reversed

        lockedPower = Math.hypot(dx, dy) * POWER_MULTIPLIER;
        lockedAngle = Math.atan2(dy, dx); // Angle of the velocity vector

        // Clamp maximum power if necessary
        // lockedPower = Math.min(lockedPower, MAX_POWER);

        gameState = 'aimingCurl';
        isSettingCurl = true;
        curlAimStartX = e.offsetX; // Start curl input from current mouse X
        currentCurlInput = 0; // Reset curl input for this phase
        statusEl.textContent = "Move mouse left/right for curl. Click to throw.";
    }
    // Note: Mouseup during 'aimingCurl' does nothing; the throw is on mousedown.
});

resetButton.addEventListener('click', resetGame);

// Sweeping Event Listeners
window.addEventListener('keydown', (e) => {
    if (gameState !== 'sliding') return; // Only allow sweeping when stones are sliding

    if (e.key.toLowerCase() === 'a') {
        isSweepingLeft = true;
    } else if (e.key.toLowerCase() === 'd') {
        isSweepingRight = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'a') {
        isSweepingLeft = false;
    } else if (e.key.toLowerCase() === 'd') {
        isSweepingRight = false;
    }
});


// --- Start the Game ---
resetGame();
update();
// --- End of new constants ---

// (The existing game logic will be here)
// ...
// Make sure to update `updateStatus` to correctly reflect stones left for the current team in the current end.
// For STONES_PER_TEAM = 4, each team throws 4 stones per end.
// totalStonesThrown counts all stones by both teams.
// stonesThrownThisTurn might be better named stonesThrownThisEnd.

// Let's refine updateStatus and endTurn logic slightly for clarity with STONES_PER_TEAM
// [REMOVED - updateStatusRefined was here]

// Replace original updateStatus call in resetGame and startTurn with updateStatusRefined if desired,
// or keep the old one and fix the logic when those features are implemented.
// For now, let's keep the original `updateStatus` and `endTurn` and modify them incrementally.
// The key change is separating files. The new constants are placeholders for now.

// The status update for stones left needs to be accurate per team per end.
// Let's refine `endTurn` and `resetGame` slightly.

// NOTE: redStonesThrownThisEnd and blueStonesThrownThisEnd are now declared at the top of the script.

// [REMOVED - second definition of resetGame was here]

// [REMOVED - second definition of updateStatus was here]

// [REMOVED - second definition of endTurn was here]


// The rest of the original JS code (calculateScore, draw functions etc.) remains the same for now.
// ...
// Make sure resetGame is called to initialize.
// Call update to start the loop.

// Initial call to setup the game
resetGame(); // This will now call the first (correct) definition of resetGame
update();
