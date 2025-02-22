const { SlashCommandBuilder } = require('discord.js');
const osOptions = ['Windows', 'Android'];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomhetapus')
        .setDescription('Generates a random ak.hetapus.com URL')
        .setContexts(0, 1, 2),
    async execute(interaction) {
        const varValue = `${getRandomInt(0, 999)}`.padStart(3, '0');
        const isMobile = Math.random() < 0.5 ? 'true' : 'false';
        const os = osOptions[Math.floor(Math.random()*osOptions.length)];

        let androidModel = '';
        let osVersion = `${getRandomInt(7, 11)}.0`;

        if (os === 'Android') {
            androidModel = `${getRandomInt(9, 14)}.0`;
        }

        const browserVersion = `${getRandomInt(100, 230)}.0.${getRandomInt(1000, 9999)}.70`;
        const url = `https://ak.hetapus.com/afu.php?zoneid=5838948&ymid=240926031719d65af7f5fb4b3cb9c915b67c&var=2624${varValue}&is_mobile=${isMobile}&os=${os}&android_model=${androidModel}&os_version=${osVersion}&browser_version=${browserVersion}`;

        await interaction.reply({ content: `Generated URL: ${url}` });
    },
};