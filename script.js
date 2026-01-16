let isRunning = false;
let isFocus = true;
let timer;
let timeLeft = 60 * 60;

let totalFocusSeconds = 0;

const timerDisplay = document.getElementById("timer");
const startPauseBtn = document.getElementById("startPause");
const resetBtn = document.getElementById("reset");
const modeText = document.getElementById("mode");
const totalFocusDisplay = document.getElementById("totalFocus");
const focusInput = document.getElementById("focusInput");
const breakInput = document.getElementById("breakInput");
const alarmSound = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");


function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    timerDisplay.textContent = formattedTime;

    if (isFocus) {
        document.title = `✅ ${formattedTime} - Time to focus!`;
    } else {
        document.title = `☕ ${formattedTime} - Time for a break!`;
    }
}
function updateTotalFocus() {
    const m = Math.floor(totalFocusSeconds / 60);
    const s = totalFocusSeconds % 60;
    totalFocusDisplay.textContent =
        `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function startTimer() {
    if (timer) clearInterval(timer);

    timer = setInterval(() => {
        timeLeft--;
        if (isFocus) {
            totalFocusSeconds++;
            updateTotalFocus();
        }

        updateDisplay();
        if (timeLeft <= 0) {
            clearInterval(timer);
            alarmSound.play();
            switchMode();
        }
    }, 1000);
}
function switchMode() {
    isFocus = !isFocus;
    modeText.textContent = isFocus ? "FOCUS" : "BREAK";
    timeLeft = (isFocus ? focusInput.value : breakInput.value) * 60;

    updateDisplay();
    isRunning = false;
    startPauseBtn.textContent = "Start";
}


startPauseBtn.addEventListener("click", () => {
    if (!isRunning) {
        startTimer();
        startPauseBtn.textContent = "Pause";
        isRunning = true;
    } else {
        clearInterval(timer);
        startPauseBtn.textContent = "Start";
        isRunning = false;
        document.title = `⏸️ ${timerDisplay.textContent} - Paused`;
    }
});

resetBtn.addEventListener("click", () => {
    clearInterval(timer);
    isRunning = false;
    startPauseBtn.textContent = "Start";

    isFocus = true;
    modeText.textContent = "FOCUS";

    timeLeft = focusInput.value * 60;
    updateDisplay();

    document.title = "Focus Timer";
})
focusInput.addEventListener("change", () => {
    if (isFocus && !isRunning) {
        timeLeft = focusInput.value * 60;
        updateDisplay();
    }
});
breakInput.addEventListener("change", () => {
    if (!isFocus && !isRunning) {
        timeLeft = breakInput.value * 60;
        updateDisplay();
    }
});
updateDisplay();
updateTotalFocus();