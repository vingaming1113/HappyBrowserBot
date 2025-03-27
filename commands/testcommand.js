// I don't know what i'm doing
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testcommandplswork')
        .setDescription('Testing command')
        .setContexts(0, 1, 2),
    async execute(interaction) {
        await interaction.reply('please work');
    },
};
