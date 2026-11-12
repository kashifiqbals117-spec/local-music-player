export function formatTime(seconds) {
    if (!seconds || Number.isNaN(seconds)) {
      return "0:00";
    }
  
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
  
    return `${minutes}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }