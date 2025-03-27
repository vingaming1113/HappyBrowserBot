const { SlashCommandBuilder } = require('discord.js');

function getRandomChar() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return chars[Math.floor(Math.random() * chars.length)];
}

function generateRandomString(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += getRandomChar();
    }
    return result;
}

function generateRandomUsername(predefinedNames) {
    const options = Math.floor(Math.random() * 3);

    if (options === 0) {
        const name = predefinedNames[Math.floor(Math.random() * predefinedNames.length)];
        const randomNumberLength = Math.floor(Math.random() * 5) + 1;
        let randomNumbers = '';
        for (let i = 0; i < randomNumberLength; i++) {
            randomNumbers += Math.floor(Math.random() * 10);
        }
        return name + randomNumbers;
    } else if (options === 1) {
        const randomStringLength = Math.floor(Math.random() * 10) + 5;
        return generateRandomString(randomStringLength);
    } else {
        const name = predefinedNames[Math.floor(Math.random() * predefinedNames.length)];
        const randomPartLength = Math.floor(Math.random() * 5) + 1;
        let randomPart = '';
        for (let i = 0; i < randomPartLength; i++) {
            if (Math.random() < 0.5) {
                randomPart += Math.floor(Math.random() * 10);
            } else {
                randomPart += getRandomChar();
            }
        }

        if (Math.random() < 0.5) {
            return randomPart + name;
        } else {
            return name + randomPart;
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomiptv')
        .setDescription('Random iptv text')
        .setContexts(0, 1, 2),
    async execute(interaction) {
        const predefinedNames = [
            'my metamask wallet got hacked i need new iptv asap and my uniswap and trust wallet got deleted pls help asap', 'trust wallet got hacked i need new iptv and sugar daddy', 'trust wallet got hacked i need new iptv and sugar daddy', 'I need help with my metamask wallet because i lost 485638 dollars from it please help', 'iptv wallet got hacked and youtube got copyright striked and banned and i lost all my money so i need sugardaddy',
            'araslmao_', '0xtiago_'
        ];

        const username = generateRandomUsername(predefinedNames);
        const iptv = `https://x.com/${username}`;

        await interaction.reply(`your iptv got hacked succesfully ${iptv}`);
    },
};
