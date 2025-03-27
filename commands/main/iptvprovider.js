const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Pagination } = require('pagination.djs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('iptvproviderlist')
        .setDescription('iptv')
        .setContexts(0, 1, 2),
    async execute(interaction) {
        const pagination = new Pagination(interaction, { ephemeral: false });

        const embed1 = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('@iptvboy')
            .setDescription('send me and inbox');

        const embed2 = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle('@happyflower7458')
            .setDescription('[[FREE IPTV SERVICE, ONLY 4.99]]');

        pagination.setEmbeds([embed1, embed2]);
        pagination.render();
    },
};