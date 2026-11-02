/**
 * Specter Brand Assets for Transactional Emails and Notifications.
 * Self-contained 64x64 Retina-ready PNG and vector SVG.
 */

export const SPECTER_LOGO_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA6ElEQVR4nO3bMQ7DIBBEUbdW7n9ZmuQClpMA5i+73xKlYebJBUj4ODqf83y9I43eHluWXYZCF0Ah6NAoAh0WRaBDogh0OBSBDoUj0IFQADoMjkAHEUAAATgAOgQ9BBh5ubXWNZ6YVwABBOABRuai1hYgQggBBBBAgLIAI+9tCzBjQxMCYAbazF2dAAIEB1hxuAkNUP4LEECA7wirs7gTpAHotQWIEEIAAQQQQIAMALNOek/MKYAAAlwDVL4n5C0xAQQQoCyC/wtU/mvksnwVhNvy2RF+Kp8V4a/y2RC6ymeAGC6+E0pvjw9ezZ5VcmViggAAAABJRU5ErkJggg==';

export const SPECTER_LOGO_PNG_BUFFER = Buffer.from(SPECTER_LOGO_BASE64, 'base64');

export const SPECTER_LOGO_SVG = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="#09090B"/>
  <path d="M8 13V8.5C8 8.22386 8.22386 8 8.5 8H13" stroke="#FAFAFA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19 8H23.5C23.7761 8 24 8.22386 24 8.5V13" stroke="#FAFAFA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 19V23.5C8 23.7761 24 8.5 24H13" stroke="#FAFAFA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19 24H23.5C23.7761 24 24 23.7761 24 23.5V19" stroke="#FAFAFA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="2.5" fill="#FAFAFA"/>
</svg>`;
