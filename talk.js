// talk.js

function startTalking(bot) {
    // Make sure the bot only starts talking once it has spawned or is ready
    const intervalTime = 5000; // 5 seconds

    console.log("Here is how you can set up `talk.js` to make your Mineflayer bot say **"peakar and clutch on top"** every 5 seconds, along with the updated `bot.js` to connect it.

### 1. Create `talk.js`
Create a new file named `talk.js` in your bot's project directory. This module exports a function that takes your bot instance, clears any previous intervals to avoid duplication, and starts a `setInterval` loop to send the chat message.

```javascript
// talk.js
let talkInterval = null;

function startTalking(bot) {
    // Clear any existing interval to prevent overlapping loops
    if (talkInterval) {
        clearInterval(talkInterval);
    }

    console.log("Talk module initialized: Bot will speak every 5 seconds.");

    talkInterval = setInterval(() => {
        // Ensure the bot is fully spawned and connected before chatting
        if (bot && bot.entity) {
            bot.chat("peakar and clutch on top");
        }
    }, 5000); // 5000 milliseconds = 5 seconds
}

module.exports = { startTalking };
