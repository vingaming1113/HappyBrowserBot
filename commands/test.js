const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Testing command')
        .setContexts(0, 1, 2),
    async execute(interaction) {
        await interaction.reply('Testing!');
    },
};