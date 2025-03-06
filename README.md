<h1 align="center">Nebula</h1>

###

<div align="center">
  <img height="550" src="https://i.ibb.co/ZRFXDBW2/Screenshot-2025-03-06-195221.png"  />
</div>

###

<h2 align="left">What is Nebula?</h2>

###

<p align="left">Nebula is a minimal theme made for Zen Browser which adds a lot of new animations, glass-like blur, UI changes, and more. It is inspired by glassmorphism and minimal gradients.<br><br>This is my personal userChrome which I made to personalize Zen to my own liking. ❤️<br>If some of you don't like the design choices I made, you can edit the userChrome yourself if you know how to code, and if you don't, you can use ChatGPT to customize it as per your preference.</p>

###

<h2 align="left">Showcase :))</h2>

<div align="center">
  <img src="https://github.com/user-attachments/assets/7dc9251f-2cba-445e-b100-9d1be8bd53e6" width="400">
  <img src="https://github.com/user-attachments/assets/361dc025-cb19-4982-a047-1e79f61042b8" width="400">
  <img src="https://github.com/user-attachments/assets/0a69ff9a-0226-452a-8bde-a21929f4a590" width="400">
  <img src="https://github.com/user-attachments/assets/75ccfbfc-5260-47ad-ba99-40113fe94b07" width="400">
  <img src="https://github.com/user-attachments/assets/06381256-4f99-41e9-a21e-22a29c3f481f" width="400">
  <img src="https://github.com/user-attachments/assets/5fa8923e-7a3d-471a-8256-1f72528926a4" width="400">
</div>

###

<h2 align="left">Features:</h2>

###

<p align="left">• Clean Animations<br> => PS: GitHub is not letting me upload videos above 10MB, so you can try the mod to experience the animations!<br><br>• Better UI (glass look)<br><br>• Better customized toolbar</p>

###

<div align="left">
  <img height="300" src="https://github.com/user-attachments/assets/36c3121a-4c0e-4061-8110-d1d55a6f688f"  />
</div>

###

<p align="left">• Lots of new animations<br> => PS: GitHub is not letting me upload videos above 10MB, so you can try the mod to experience the animations!</p>

###

<h2 align="left">Installation:</h2>

###

<h3 align="left">1. Installing CSS</h3>

###

<p align="left">• If you have not already, follow the Zen Live Editing guide to first create your chrome folder: https://docs.zen-browser.app/guides/live-editing<br><br>• Download the userChrome.css file and paste it into your chrome folder.<br><br>• Restart the browser to see if the UI has changed.<br><br>• Go to about:config in Zen and search for "browser.tabs.allow_transparent_browser". If the option is visible, set it to "true". If not, click the "+" icon and set it to "boolean".</p>

###

<h3 align="left">2. Install Mica For Everyone (ONLY FOR WINDOWS 11 USERS)</h3>

###

<p align="left">• To get real backdrop filter transparency, go to "https://github.com/MicaForEveryone/MicaForEveryone" and install the app.<br><br>• Click the "+ Add new Rule" at the bottom left and "Add process rule" for "zen".</p>

###

<div align="left">
  <img height="400" src="https://github.com/user-attachments/assets/34f6965c-1bdc-4ea1-8605-efde3b898d23"  />
</div>

###

<p align="left">• Change the Backdrop type to Acrylic and enable blur behind in advanced options.<br><br>• Restart Zen and see how it looks.</p>

###

<h3 align="left">3. Add the Firefox extension Bonjourrr</h3>

###

<p align="left">• Go to "https://addons.mozilla.org/en-US/firefox/addon/bonjourr-startpage/" and install this extension.<br><br>• The new tab must be replaced by this now. On the bottom right, you will see a settings button for new tab. Change the settings to these:</p>

###

<div align="center">
  <img height="300" src="https://github.com/user-attachments/assets/e7e27035-6e2b-4006-abf7-091a103536f9"  />
</div>

###

<div align="center">
  <img height="300" src="https://github.com/user-attachments/assets/d8fb107f-1247-4a3e-8026-619311e2dee5"  />
</div>

###

<div align="center">
  <img height="300" src="https://github.com/user-attachments/assets/724abcd8-a9f0-4d76-a054-3d76e3c7db60"  />
</div>

###

<p align="left">• In the section where it says "Add custom CSS", add this code:</p>

```css
@import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@300&display=swap');

body, h1, h2, h3, h4, h5, h6, p, span, div {
    font-family: 'Comfortaa', sans-serif !important;
    font-weight: 300 !important; /* Light weight for a sleek and modern feel */
    letter-spacing: 0.025em; /* Slight spacing for better readability */
    font-smooth: always;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: #e0e0e0; /* Soft white for a modern touch */
}

h1 {
    font-weight: 400 !important; /* Slightly bolder headlines */
    letter-spacing: 0.025em;
}

p {
    font-weight: 300 !important;
    line-height: 1.6;
    letter-spacing: 0.015em;
}

/* Optional: Add a soft glow effect for a smooth aesthetic */
p, h1, h2, h3 {
    text-shadow: 0 0 1px rgba(255, 255, 255, 0.2);
}
