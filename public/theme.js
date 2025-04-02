// themes.js

// Define theme properties using CSS variables
const themes = {
    default: {
        '--bg-gradient-start': '#1e90ff',
        '--bg-gradient-end': '#32cd32',
        '--text-color': '#ffffff',
        '--container-bg': 'rgba(255, 255, 255, 0.1)',
        '--button-bg': '#ff4500',
        '--button-hover-bg': '#ff6347',
        '--choice-bg': '#ffffff',
        '--choice-color': '#333333',
        '--choice-shadow': 'rgba(255, 255, 255, 0.5)',
        '--score-color': '#ffffff',
        '--result-color': '#ffffff',
        '--link-color': '#f0f0ff',
        '--input-bg': '#555555',
        '--input-color': '#eeeeee',
        '--input-border': '#666666'
    },
    dark: {
        '--bg-gradient-start': '#23272A',
        '--bg-gradient-end': '#1c1e22',
        '--text-color': '#eeeeee',
        '--container-bg': 'rgba(0, 0, 0, 0.3)',
        '--button-bg': '#7289DA',
        '--button-hover-bg': '#5f73bc',
        '--choice-bg': '#4f545c',
        '--choice-color': '#eeeeee',
        '--choice-shadow': 'rgba(114, 137, 218, 0.6)',
        '--score-color': '#eeeeee',
        '--result-color': '#eeeeee',
        '--link-color': '#879eed',
        '--input-bg': '#2f3136',
        '--input-color': '#dcddde',
        '--input-border': '#4f545c'
    },
    neon: {
        '--bg-gradient-start': '#0d0221',
        '--bg-gradient-end': '#0a0118',
        '--text-color': '#00ffcc',
        '--container-bg': 'rgba(255, 0, 150, 0.15)',
        '--button-bg': '#f900ff',
        '--button-hover-bg': '#c400cc',
        '--choice-bg': '#00ffcc',
        '--choice-color': '#0d0221',
        '--choice-shadow': 'rgba(0, 255, 204, 0.8)',
        '--score-color': '#ff0066',
        '--result-color': '#00ffcc',
        '--link-color': '#f900ff',
        '--input-bg': '#2a0531',
        '--input-color': '#00ffcc',
        '--input-border': '#f900ff'
    },
    retro: {
        '--bg-gradient-start': '#D7AFAF',
        '--bg-gradient-end': '#AFCAD7',
        '--text-color': '#4A4A4A',
        '--container-bg': 'rgba(255, 255, 255, 0.6)',
        '--button-bg': '#FF8C42',
        '--button-hover-bg': '#FF6F00',
        '--choice-bg': '#E0E0E0',
        '--choice-color': '#4A4A4A',
        '--choice-shadow': 'rgba(74, 74, 74, 0.4)',
        '--score-color': '#4A4A4A',
        '--result-color': '#4A4A4A',
        '--link-color': '#8b5a2b',
        '--input-bg': '#d3d3d3',
        '--input-color': '#4A4A4A',
        '--input-border': '#aaaaaa'
    },
     nature: {
        '--bg-gradient-start': '#87CEEB',
        '--bg-gradient-end': '#228B22',
        '--text-color': '#1A4D2E',
        '--container-bg': 'rgba(255, 248, 220, 0.7)',
        '--button-bg': '#CD853F',
        '--button-hover-bg': '#A0522D',
        '--choice-bg': '#F5F5DC',
        '--choice-color': '#8B4513',
        '--choice-shadow': 'rgba(34, 139, 34, 0.5)',
        '--score-color': '#1A4D2E',
        '--result-color': '#1A4D2E',
        '--link-color': '#228B22',
        '--input-bg': '#e8e4d0',
        '--input-color': '#1A4D2E',
        '--input-border': '#CD853F'
    },
    cosmic: {
        '--bg-gradient-start': '#00003f',
        '--bg-gradient-end': '#2c003e',
        '--text-color': '#E0E0E0',
        '--container-bg': 'rgba(75, 0, 130, 0.25)',
        '--button-bg': '#FFD700',
        '--button-hover-bg': '#FFA500',
        '--choice-bg': '#C0C0C0',
        '--choice-color': '#00003f',
        '--choice-shadow': 'rgba(255, 215, 0, 0.7)',
        '--score-color': '#FFD700',
        '--result-color': '#E0E0E0',
        '--link-color': '#dda0dd',
        '--input-bg': '#4b0082',
        '--input-color': '#E0E0E0',
        '--input-border': '#FFD700'
    },
    cyberpunk: {
        '--bg-gradient-start': '#0a0f0f',
        '--bg-gradient-end': '#1a001a',
        '--text-color': '#00ffff',
        '--container-bg': 'rgba(255, 0, 255, 0.1)',
        '--button-bg': '#ff00ff',
        '--button-hover-bg': '#cc00cc',
        '--choice-bg': '#ffff00',
        '--choice-color': '#0a0f0f',
        '--choice-shadow': 'rgba(0, 255, 255, 0.7)',
        '--score-color': '#ffff00',
        '--result-color': '#00ffff',
        '--link-color': '#ff00ff',
        '--input-bg': '#220022',
        '--input-color': '#ffff00',
        '--input-border': '#ff00ff'
    },
    fantasy: {
        '--bg-gradient-start': '#4a2a67',
        '--bg-gradient-end': '#9370DB',
        '--text-color': '#FFFAF0',
        '--container-bg': 'rgba(218, 165, 32, 0.35)',
        '--button-bg': '#8B0000',
        '--button-hover-bg': '#B22222',
        '--choice-bg': '#DAA520',
        '--choice-color': '#4a2a67',
        '--choice-shadow': 'rgba(255, 250, 240, 0.6)',
        '--score-color': '#FFFAF0',
        '--result-color': '#FFFAF0',
        '--link-color': '#FFD700',
        '--input-bg': '#6b4f2c',
        '--input-color': '#FFFAF0',
        '--input-border': '#DAA520'
    }
};

/**
 * Applies the selected theme by setting CSS variables on the root element.
 * @param {string} themeName - The name of the theme to apply (key in the themes object).
 */
function applyTheme(themeName) {
    const theme = themes[themeName] || themes.default;
    const root = document.documentElement; // Get the <html> element

    console.log(`Applying theme: ${themeName}`);
    // Loop through the theme properties and set CSS variables
    for (const property in theme) {
        if (Object.hasOwnProperty.call(theme, property)) {
            root.style.setProperty(property, theme[property]);
            // console.log(`Set ${property} to ${theme[property]}`); // Debug logging
        }
    }

    // Store the selected theme in localStorage
    try {
        localStorage.setItem('selectedTheme', themeName);
    } catch (e) {
        console.warn("Could not save theme to localStorage:", e);
    }
}

// Apply the saved theme on initial load
document.addEventListener('DOMContentLoaded', () => {
    let savedTheme = null;
    try {
         savedTheme = localStorage.getItem('selectedTheme');
    } catch (e) {
        console.warn("Could not read theme from localStorage:", e);
    }

    const themeSelect = document.getElementById('theme-select');
    const themeToApply = (savedTheme && themes[savedTheme]) ? savedTheme : 'default';

    if (themeSelect) {
        themeSelect.value = themeToApply; // Update dropdown to match applied theme
    }
    applyTheme(themeToApply); // Apply the determined theme
});