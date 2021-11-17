const tmi = require("tmi.js");
const config = require("./config.json");
const mysql = require("mysql");

var warnedViewers = [];
var usedCommands = [];
var automod = true;

// Create mysql connection
const connection = mysql.createConnection({
    host: config.sql_host,
    user: config.sql_user,
    password: config.sql_pass,
    database: config.sql_base
});

connection.query("SELECT * FROM commands", function(err, results, fields) {
    if (err) throw err;
    console.log("Connected to database !");
})

// Create twitch connection
const client = new tmi.Client({
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: config.id_username,
        password: config.id_password
    },
    channels: config.channels
});
client.connect();

// Count percentage of uppercase in a string
function countUppercasePercentage(str) {
    var count = 0;
    var maxLen = str.length;

    for (var i=0; i<maxLen; i++) {
        if (/[A-Z]/.test(str.charAt(i))) count++;
    }

    var percentage = (count/maxLen)*100;
    return percentage;
}


// Verify if a sentence is correct, block it if not
function checkChatSentence(channel, tags, condition, blockMsg) {
    if (!automod) return;

    if (condition) {
        if (warnedViewers.includes(tags.username)) {

            client.say(channel, `@${tags.username}, tu as déjà été averti pour une infraction, tu prends ton ban pour ${config.ban_time_minutes} minutes !`);
            client.timeout(channel, tags.username, config.ban_time_minutes*60, "Non-respect des règles du chat (selon le bot)");
            warnedViewers.splice(warnedViewers.indexOf(tags.username), 1);

        } else {

            client.say(channel, `@${tags.username}, ${blockMsg}`);
            client.deletemessage(channel, tags.id);
            warnedViewers.push(tags.username);

        }

        return true;
    }
}


// On message system
client.on("message", async(channel, tags, message, self) => {
    if (self) return;

    const args = message.slice(1).split(" ");
    const command = args.shift().toLowerCase();

    const emotes = tags.emotes;
    if (emotes && Object.keys(emotes).length > 0) {

        var totalCount = 0;
        Object.values(emotes).forEach(emote => {
            totalCount = totalCount + emote.length;
        })

        var check = await checkChatSentence(channel, tags, (totalCount > config.max_emojis_per_msg), `vous ne pouvez pas utiliser plus de ${config.max_emojis_per_msg} emojis par message, prochaine fois c'est le ban !`);
        if (check) return;

    }

    // Security system
    if (message.length > config.min_character_uppercase_detection) {

        var check = await checkChatSentence(channel, tags, (countUppercasePercentage(message) > config.max_uppercase_percentage), `l'abus des lettres majuscules (+${config.max_uppercase_percentage}%) est interdit, prochaine fois c'est le ban !`);
        if (check) return;

    }

    // Defined commands
    if (command == config.cmd_add_cmd) {

        if (!tags.mod) return;
        if (!args[0] || !args[1]) return client.say(channel, `@${tags.username}, veuillez préciser une commande puis le texte qu'elle doit renvoyer !`);

        var answerText = ""
        args.forEach(arg => {
            if (args[0] == arg) return;
            answerText = answerText + " " + arg
        })
        answerText = answerText.trim();

        connection.query(`INSERT INTO commands(command, answer) VALUES(${connection.escape(args[0])}, ${connection.escape(answerText)})`, function(err, results) {
            if (err) throw err;

            console.log(`New command ${args[0]} has been added to the database !`);
            client.say(channel, `La nouvelle commande "!${args[0]}" a été ajoutée avec succès !`);
        });

        return;

    } else if (command == config.cmd_del_cmd) {

        if (!tags.mod) return;
        if (!args[0]) return client.say(channel, `@${tags.username}, veuillez préciser une commande à supprimer !`);

        connection.query(`DELETE FROM commands WHERE command=${connection.escape(args[0])}`, function(err, results) {
            if (err) throw err;

            console.log(`Command ${args[0]} has been delete from the database !`);
            client.say(channel, `La commande "!${args[0]}" a été supprimée avec succès !`);
        });
        return;

    } else if (command == config.cmd_switch_automod) {

        if (!tags.mod) return;
        if (automod) {
            automod = false;
            client.say(channel, `Automod désactivé, les modérateurs humains prennent la main.`);
        } else {
            automod = true;
            client.say(channel, `Automod activé, faites attention à vous, je n'ai aucune pitié.`);
        }

    }

    // Check in database commands
    if (!usedCommands.includes(command)) {

        connection.query(`SELECT answer FROM commands WHERE command=${connection.escape(command)}`, function(err, results) {
            if (err) throw err;
            if (!results || !results[0]) return;

            const answer = results[0].answer;
            if (!answer) return;

            usedCommands.push(command);
            setTimeout(() => {
                usedCommands.splice(usedCommands.indexOf(command), 1);
            }, config.cooldown_cmd*1000);

            client.say(channel, answer.Trim() + ` (📛 ${config.cooldown_cmd}s)`);
        })

    }

})
