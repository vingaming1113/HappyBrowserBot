const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Pagination } = require('pagination.djs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('happyphone')
        .setDescription('Make your phone happy')
        .setContexts(0, 1, 2),
    async execute(interaction) {
        const pagination = new Pagination(interaction, { ephemeral: false });

        const embed1 = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Happy Phone')
            .setDescription('Make your phone happy. It needs to become happy.');

        const embed2 = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle('Happy Phone')
            .setDescription('Make it happy, just make it happy. Please make it happy and keep it happy. Bun + Metamask wallet has been drained because my trustworthy provider refused to recover my trusted shield wallet with a fox called metamask.');
        
        const embed3 = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Happy')
            .setDescription('If your device is happy, keep it happy. Do not make it sad or neutral or anything else than being Happy. It should ALWAYS be Happy.')
            .setFooter({ text: 'Should always be happy' });

        pagination.setEmbeds([embed1, embed2, embed3]);
        pagination.render();
    },
};