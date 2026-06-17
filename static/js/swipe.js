// TyloPlanner — Swipe gestures for mobile list items (archive notes, complete tasks).
"use strict";

import { api, todayStr, toast } from './utils.js';

let touchStartX = 0;
let touchStartY = 0;
let swipeActiveElement = null;
let swipeBgElement = null;
let currentDeltaX = 0;
let isHorizontalSwipe = false;

export function initSwipeGestures() {
  const setupContainer = (containerId, selector, type, onSwipeLeft) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Use event delegation
    container.addEventListener("touchstart", (e) => {
      const target = e.target.closest(selector);
      if (!target) return;

      // Ignore if touching interactive elements directly
      if (
        e.target.closest("button") ||
        e.target.closest(".hcheck") ||
        e.target.closest("input") ||
        e.target.closest("a") ||
        e.target.closest(".task-drag-handle") ||
        e.target.closest("select") ||
        e.target.closest("textarea")
      ) {
        return;
      }

      swipeActiveElement = target;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      currentDeltaX = 0;
      isHorizontalSwipe = false;

      // Reset transition to make tracking instant
      swipeActiveElement.style.transition = "none";
      
      // Ensure it sits on top of absolute background
      swipeActiveElement.style.position = "relative";
      swipeActiveElement.style.zIndex = "2";
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
      if (!swipeActiveElement) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      // Determine horizontal swipe intent
      if (!isHorizontalSwipe && Math.abs(deltaX) > 10) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          isHorizontalSwipe = true;
        } else {
          // If vertical, cancel this swipe
          swipeActiveElement.style.transform = "";
          swipeActiveElement.style.opacity = "";
          swipeActiveElement = null;
          return;
        }
      }

      if (isHorizontalSwipe) {
        // Only allow swiping left (negative deltaX)
        if (deltaX < 0) {
          // Prevent scroll bounce or scroll navigation
          if (e.cancelable) e.preventDefault();
          currentDeltaX = deltaX;
          
          // Apply horizontal translation
          swipeActiveElement.style.transform = `translateX(${deltaX}px)`;

          // Create/update swipe background behind the item
          if (!swipeBgElement) {
            swipeBgElement = document.createElement("div");
            swipeBgElement.className = `swipe-bg ${type === 'notes' ? 'archive' : 'complete'}`;
            
            // Set exact dimensions to match target card
            swipeBgElement.style.top = swipeActiveElement.offsetTop + "px";
            swipeBgElement.style.left = swipeActiveElement.offsetLeft + "px";
            swipeBgElement.style.width = swipeActiveElement.offsetWidth + "px";
            swipeBgElement.style.height = swipeActiveElement.offsetHeight + "px";
            swipeBgElement.style.borderRadius = window.getComputedStyle(swipeActiveElement).borderRadius;
            
            // Text representation inside the background
            swipeBgElement.innerHTML = type === 'notes' 
              ? '<span>📦 Archive</span>' 
              : '<span>✅ Done</span>';
            
            swipeActiveElement.parentNode.insertBefore(swipeBgElement, swipeActiveElement);
          }

          // Visual feedback depending on swipe depth
          const absDelta = Math.abs(deltaX);
          if (absDelta > 100) {
            swipeBgElement.style.opacity = "1";
            swipeActiveElement.style.opacity = "0.7";
          } else {
            swipeBgElement.style.opacity = `${absDelta / 100}`;
            swipeActiveElement.style.opacity = "1";
          }
        } else {
          // Reset if swiped right
          swipeActiveElement.style.transform = "";
          swipeActiveElement.style.opacity = "1";
          currentDeltaX = 0;
          cleanupBg();
        }
      }
    }, { passive: false });

    const handleTouchEndOrCancel = async () => {
      if (!swipeActiveElement) return;

      const element = swipeActiveElement;
      const bg = swipeBgElement;
      
      swipeActiveElement = null;
      swipeBgElement = null;

      element.style.transition = "transform 0.2s ease, opacity 0.2s ease";

      if (isHorizontalSwipe && currentDeltaX < -100) {
        // Complete the swipe: slide off-screen to the left
        element.style.transform = "translateX(-120%)";
        element.style.opacity = "0";

        if (bg) {
          bg.style.transition = "opacity 0.2s ease";
          bg.style.opacity = "0";
        }

        setTimeout(async () => {
          const id = element.dataset.id || element.getAttribute("data-id");
          if (bg) bg.remove();
          if (id) {
            await onSwipeLeft(id, element);
          }
        }, 200);
      } else {
        // Cancel: animate back
        element.style.transform = "";
        element.style.opacity = "1";
        if (bg) {
          bg.style.transition = "opacity 0.2s ease";
          bg.style.opacity = "0";
          setTimeout(() => bg.remove(), 200);
        }
      }
    };

    container.addEventListener("touchend", handleTouchEndOrCancel, { passive: true });
    container.addEventListener("touchcancel", handleTouchEndOrCancel, { passive: true });
  };

  const cleanupBg = () => {
    if (swipeBgElement) {
      swipeBgElement.remove();
      swipeBgElement = null;
    }
  };

  // 1. Notes Tab: Swipe Left to Archive/Delete note
  setupContainer("noteList", ".list-item", "notes", async (id, element) => {
    try {
      await api("DELETE", "/api/notes/" + id);
      const activeId = localStorage.getItem("active_note_id");
      if (activeId === id) {
        localStorage.removeItem("active_note_id");
      }
      toast("Note archived");
      if (window.refreshApp) {
        await window.refreshApp();
      }
    } catch (err) {
      console.error("Failed to swipe-archive note:", err);
      element.style.transform = "";
      element.style.opacity = "1";
      toast("Failed to archive note");
    }
  });

  // 2. Tasks Tab: Swipe Left to Complete task
  setupContainer("taskList", ".task-card", "tasks", async (id, element) => {
    try {
      await api("PUT", "/api/tasks/" + id, { done: 1, completed_at: todayStr() });
      toast("Task completed");
      if (window.refreshApp) {
        await window.refreshApp();
      }
    } catch (err) {
      console.error("Failed to swipe-complete task:", err);
      element.style.transform = "";
      element.style.opacity = "1";
      toast("Failed to complete task");
    }
  });
}
