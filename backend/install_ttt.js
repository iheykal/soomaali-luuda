const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
const handlersPath = path.join(__dirname, 'ttt_socket_handlers.txt');

try {
    let serverContent = fs.readFileSync(serverPath, 'utf8');
    const handlersContent = fs.readFileSync(handlersPath, 'utf8');

    // 1. Inject Socket Handlers
    // Look for the specific disconnect handler pattern to insert before it
    const targetString = "socket.on('disconnect', async () => {";

    if (serverContent.includes('ttt_join_game')) {
        console.log('Tic-Tac-Toe handlers already present.');
    } else {
        if (serverContent.includes(targetString)) {
            serverContent = serverContent.replace(
                targetString,
                `\n${handlersContent}\n\n    ${targetString}`
            );
            console.log('✅ Injected Tic-Tac-Toe socket handlers.');
        } else {
            console.error('❌ Could not find insertion point for socket handlers.');
        }
    }

    // 2. Update Matchmaking Queue (if variable exists and accessible in this simple regex way)
    // This is riskier with regex on a huge file without knowing exact context, 
    // but let's try to find where matchmakingQueue is defined.
    // Based on previous grep failing, maybe it's not named matchmakingQueue. 
    // We will skip this part in the script and do it via tool if we can find it.

    fs.writeFileSync(serverPath, serverContent);
    console.log('✅ server.js updated successfully.');

} catch (err) {
    console.error('Error updating server.js:', err);
}
