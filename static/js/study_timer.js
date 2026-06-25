// TyloPlanner — Study Timer & Pomodoro module.

import { todayStr, esc, toast, api, z } from './utils.js';

export function renderStudyTimerWidget(id) {
  return `
    <div x-data="studyTimerWidget()" x-init="init()" class="study-timer-widget">
      <!-- Left side: Circular progress -->
      <div class="timer-circle-container">
        <svg viewBox="0 0 160 160">
          <circle class="progress-ring__track" cx="80" cy="80" r="70" stroke="var(--border)" stroke-width="8" fill="none" />
          <circle class="progress-ring__circle" cx="80" cy="80" r="70" stroke="var(--accent)" stroke-width="8" fill="none"
                  stroke-dasharray="440"
                  :stroke-dashoffset="getDashOffset()" />
        </svg>
        <div class="timer-text-container">
          <div class="timer-time" x-text="formatTime()">00:00</div>
          <div class="timer-label" x-text="getLabelText()">Idle</div>
        </div>
      </div>

      <!-- Right side: Controls -->
      <div class="timer-controls-container" style="display:flex; flex-direction:column; gap:6px;">
        <!-- Tab Select Mode -->
        <div style="display:flex; background:var(--panel2); border-radius:6px; padding:2px; border: 1px solid var(--border);" x-show="timerState === 'idle'">
          <button @click="setMode('pomodoro')" class="btn small" :class="mode === 'pomodoro' ? '' : 'ghost'" style="flex:1; border:none; padding:4px 0; font-size:11px; outline:none; border-radius:4px;">Pomodoro</button>
          <button @click="setMode('stopwatch')" class="btn small" :class="mode === 'stopwatch' ? '' : 'ghost'" style="flex:1; border:none; padding:4px 0; font-size:11px; outline:none; border-radius:4px;">Stopwatch</button>
        </div>

        <!-- Timer Label/Subject Input when idle -->
        <div x-show="timerState === 'idle'" class="miniform" style="margin-top:0;">
          <input type="text" x-model="subject" placeholder="Subject (e.g. Math, Coding)" style="width:100%; padding:4px 8px; font-size:11px; height:26px;" />
        </div>
        <!-- Active subject label when running/paused -->
        <div x-show="timerState !== 'idle'" style="text-align:center; font-weight:600; font-size:12px; color:var(--text); padding: 4px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" x-text="subject || 'Study Session'"></div>

        <!-- Settings (Only when idle and Pomodoro Mode) -->
        <div x-show="timerState === 'idle' && mode === 'pomodoro'" style="display:flex; gap:4px; align-items:center; margin-top:2px;">
          <select x-model.number="customStudyMinutes" style="flex:1; padding:3px 6px; font-size:11px; height:26px; min-width:0;">
            <option :value="15">15m study</option>
            <option :value="25">25m study</option>
            <option :value="45">45m study</option>
            <option :value="50">50m study</option>
            <option :value="60">60m study</option>
          </select>
          <select x-model.number="customBreakMinutes" style="flex:1; padding:3px 6px; font-size:11px; height:26px; min-width:0;">
            <option :value="3">3m break</option>
            <option :value="5">5m break</option>
            <option :value="10">10m break</option>
            <option :value="15">15m break</option>
          </select>
        </div>

        <!-- Controls depending on state -->
        <div style="display:flex; gap:4px; justify-content:center; align-items:center;">
          <!-- Play / Pause -->
          <button class="btn small" @click="toggle()" style="flex:1; padding:4px 8px;" x-text="timerState === 'running' ? 'Pause' : 'Start'"></button>
          
          <!-- Stop & Log (Stopwatch mode or Pomodoro completed/running) -->
          <button class="btn small ghost" @click="stopAndLogPrompt()" x-show="timerState !== 'idle'" style="flex:1; padding:4px 8px; border: 1px solid var(--border);">Log</button>
          
          <!-- Reset (Paused or running) -->
          <button class="btn small danger" @click="reset()" x-show="timerState === 'paused' || timerState === 'running'" style="padding:4px 8px; flex:0.4; font-size:11px; border: 1px solid var(--border);" title="Reset">✕</button>
        </div>

        <!-- Log Session Dialog Inline inside card -->
        <div x-show="showLogDialog" style="border: 1px solid var(--border); background: var(--panel2); border-radius: 8px; padding: 8px; margin-top: 4px; display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; font-weight:600;">Log Study Session</div>
          <div style="display:flex; gap:4px; align-items:center;">
            <input type="text" x-model="logSubject" placeholder="Subject" style="flex:1.5; padding:3px 6px; font-size:11px; height:24px; min-width:0;" />
            <input type="number" step="0.5" x-model.number="logDuration" style="width:55px; padding:3px 6px; font-size:11px; height:24px;" title="Minutes" />
            <span style="font-size:11px; color:var(--muted)">m</span>
          </div>
          <div style="display:flex; gap:4px; justify-content:flex-end; margin-top:2px;">
            <button class="btn small ghost" @click="cancelLog()" style="padding:2px 6px; font-size:10px; border:1px solid var(--border);">Cancel</button>
            <button class="btn small" @click="saveLog()" style="padding:2px 6px; font-size:10px;">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function studyTimerWidget() {
  return {
    mode: 'pomodoro', // 'pomodoro', 'stopwatch', 'break'
    timerState: 'idle', // 'idle', 'running', 'paused'
    subject: '',
    customStudyMinutes: 25,
    customBreakMinutes: 5,
    
    // Time tracking
    totalDuration: 1500, // seconds
    timeLeft: 1500,
    timeElapsed: 0,
    
    // Internal timing variables
    startTime: null,
    accumulatedTime: 0,
    timerInterval: null,
    
    // Log Dialog
    showLogDialog: false,
    logSubject: '',
    logDuration: 0,

    // Pending mode transition after session complete (deferred until log dismissed)
    _pendingMode: null,
    
    // Bound handler reference for cleanup
    _visibilityHandler: null,
    
    init() {
      // Clean up any pre-existing interval (guards against Alpine re-init on dashboard re-render)
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      
      // Restore from localStorage
      this.restoreState();
      
      // Handle visibility change to refresh correct elapsed time when user leaves/returns to tab
      this._visibilityHandler = () => {
        if (!document.hidden && this.timerState === 'running') {
          this.recalculateElapsedTime();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
      
      // If was running, restart the interval check
      if (this.timerState === 'running') {
        this.startInterval();
      }

      return () => {
        this.destroy();
      };
    },
    
    destroy() {
      // Alpine lifecycle: clean up interval and event listener when component is torn down
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }
    },
    
    recalculateElapsedTime() {
      if (this.timerState !== 'running' || !this.startTime) return;
      const passed = Math.floor((Date.now() - this.startTime) / 1000) + this.accumulatedTime;
      if (this.mode === 'pomodoro' || this.mode === 'break') {
        this.timeLeft = Math.max(0, this.totalDuration - passed);
        if (this.timeLeft <= 0) {
          this.completeSession();
        }
      } else {
        this.timeElapsed = passed;
      }
    },
    
    restoreState() {
      const saved = localStorage.getItem('study_timer_state');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          this.mode = data.mode || 'pomodoro';
          this.timerState = data.timerState || 'idle';
          this.subject = data.subject || '';
          this.customStudyMinutes = data.customStudyMinutes || 25;
          this.customBreakMinutes = data.customBreakMinutes || 5;
          this.totalDuration = data.totalDuration || 1500;
          this.accumulatedTime = data.accumulatedTime || 0;
          this.startTime = data.startTime || null;
          
          if (this.timerState === 'running' && this.startTime) {
            const passed = Math.floor((Date.now() - this.startTime) / 1000) + this.accumulatedTime;
            if (this.mode === 'pomodoro' || this.mode === 'break') {
              this.timeLeft = Math.max(0, this.totalDuration - passed);
              if (this.timeLeft === 0) {
                this.timerState = 'paused';
                this.accumulatedTime = this.totalDuration;
              }
            } else {
              this.timeElapsed = passed;
            }
          } else {
            if (this.mode === 'pomodoro' || this.mode === 'break') {
              this.timeLeft = data.timeLeft !== undefined ? data.timeLeft : this.totalDuration;
            } else {
              this.timeElapsed = data.timeElapsed || 0;
            }
          }
        } catch(e) {
          console.error("Failed to restore timer state", e);
        }
      }
    },
    
    saveState() {
      const data = {
        mode: this.mode,
        timerState: this.timerState,
        subject: this.subject,
        customStudyMinutes: this.customStudyMinutes,
        customBreakMinutes: this.customBreakMinutes,
        totalDuration: this.totalDuration,
        timeLeft: this.timeLeft,
        timeElapsed: this.timeElapsed,
        startTime: this.startTime,
        accumulatedTime: this.accumulatedTime
      };
      localStorage.setItem('study_timer_state', JSON.stringify(data));
    },
    
    setMode(m) {
      if (this.timerState !== 'idle') return;
      this.mode = m;
      this.reset();
      this.saveState();
    },
    
    toggle() {
      if (this.timerState === 'running') {
        this.pause();
      } else {
        this.start();
      }
    },
    
    start() {
      if (this.timerState === 'idle') {
        this.accumulatedTime = 0;
        if (this.mode === 'pomodoro') {
          this.totalDuration = this.customStudyMinutes * 60;
          this.timeLeft = this.totalDuration;
        } else if (this.mode === 'break') {
          this.totalDuration = this.customBreakMinutes * 60;
          this.timeLeft = this.totalDuration;
        } else {
          this.timeElapsed = 0;
        }
      }
      
      this.startTime = Date.now();
      this.timerState = 'running';
      this.saveState();
      
      this.startInterval();
    },
    
    startInterval() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        this.tick();
      }, 500);
    },
    
    tick() {
      if (this.timerState !== 'running' || !this.startTime) return;
      const passed = Math.floor((Date.now() - this.startTime) / 1000) + this.accumulatedTime;
      
      if (this.mode === 'pomodoro' || this.mode === 'break') {
        this.timeLeft = Math.max(0, this.totalDuration - passed);
        this.saveState();
        if (this.timeLeft <= 0) {
          this.completeSession();
        }
      } else {
        this.timeElapsed = passed;
        this.saveState();
      }
    },
    
    pause() {
      if (this.timerState !== 'running') return;
      this.accumulatedTime += Math.floor((Date.now() - this.startTime) / 1000);
      this.timerState = 'paused';
      this.startTime = null;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.saveState();
    },
    
    reset() {
      this.timerState = 'idle';
      this.startTime = null;
      this.accumulatedTime = 0;
      this.showLogDialog = false;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      
      if (this.mode === 'pomodoro') {
        this.totalDuration = this.customStudyMinutes * 60;
        this.timeLeft = this.totalDuration;
      } else if (this.mode === 'break') {
        this.totalDuration = this.customBreakMinutes * 60;
        this.timeLeft = this.totalDuration;
      } else {
        this.timeElapsed = 0;
      }
      
      this.saveState();
    },
    
    completeSession() {
      this.pause();
      this.playBell();
      
      if (this.mode === 'pomodoro') {
        // Defer mode switch — setMode() calls reset() which wipes the log dialog.
        // The switch to break mode happens in saveLog() or cancelLog() instead.
        this._pendingMode = 'break';
        this.stopAndLogPrompt();
      } else if (this.mode === 'break') {
        this._pendingMode = 'pomodoro';
        this.mode = 'pomodoro';
        this.reset();
      }
    },
    
    playBell() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.51, now);
        
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.5);
        osc2.stop(now + 1.5);
      } catch(e) {
        console.warn("Web Audio API chime blocked or not supported", e);
      }
    },
    
    stopAndLogPrompt() {
      this.pause();
      this.showLogDialog = true;
      this.logSubject = this.subject || 'Study';
      
      let durMinutes = 0;
      if (this.mode === 'pomodoro') {
        const elapsed = this.totalDuration - this.timeLeft;
        durMinutes = Math.round((elapsed / 60) * 10) / 10;
      } else {
        durMinutes = Math.round((this.timeElapsed / 60) * 10) / 10;
      }
      this.logDuration = durMinutes;
    },
    
    cancelLog() {
      this.showLogDialog = false;
      // Apply any deferred mode transition from completeSession
      if (this._pendingMode) {
        this.mode = this._pendingMode;
        this._pendingMode = null;
        this.reset();
      }
    },
    
    async saveLog() {
      if (this.logDuration <= 0) {
        alert("Duration must be greater than 0");
        return;
      }
      
      const payload = {
        subject: this.logSubject || 'Study',
        date: todayStr(),
        duration: this.logDuration,
        completed: 1
      };
      
      try {
        await api("POST", "/api/study_sessions", payload);
        toast("Study session logged successfully!");
        this.showLogDialog = false;
        // Apply any deferred mode transition from completeSession
        if (this._pendingMode) {
          this.mode = this._pendingMode;
          this._pendingMode = null;
        }
        this.reset();
        
        if (window.refreshApp) {
          window.refreshApp();
        }
      } catch(e) {
        console.error("Failed to save study session", e);
        alert("Failed to log study session");
      }
    },
    
    getDashOffset() {
      if (this.mode === 'stopwatch') {
        return this.timerState === 'running' ? 220 : 0;
      }
      if (this.totalDuration <= 0) return 0;
      const fraction = 1 - (this.timeLeft / this.totalDuration);
      return Math.round(440 * fraction);
    },
    
    formatTime() {
      let totalSeconds = 0;
      if (this.mode === 'pomodoro' || this.mode === 'break') {
        totalSeconds = this.timeLeft;
      } else {
        totalSeconds = this.timeElapsed;
      }
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return z(mins) + ":" + z(secs);
    },
    
    getLabelText() {
      if (this.timerState === 'idle') return 'Idle';
      if (this.mode === 'break') return 'Break';
      if (this.mode === 'pomodoro') return 'Study';
      return 'Elapsed';
    }
  };
}

// Make the component globally accessible for Alpine.js instantiation
window.studyTimerWidget = studyTimerWidget;
