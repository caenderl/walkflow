// Applies the theme chosen in the app (src/ui/theme.ts, same localStorage key). Without a choice: follow the system.
try {
  const theme = localStorage.getItem('walkflow.theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch { /* storage blocked: follow the system */ }
