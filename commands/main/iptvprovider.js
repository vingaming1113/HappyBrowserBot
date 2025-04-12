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
            .setTitle('cool boy(@iptvboy)')
            .setDescription('"send me and inbox"');

        const embed2 = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle('happy flower(@happyflower7458)')
            .setDescription('"[[FREE IPTV SERVICE, ONLY 4.99]]"');

        const embed3 = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle('IPTV CHANNELS PROVIDER(@Maxwell0845)')
            .setDescription('"Hello, my tokens are still stuck on my old metamask account, i tried everything i could to transfer them to trust wallets coinbase but it just won\'t work, maybe it\'s because my iptv is too slow, can someone please help me"');


        const embed4 = new EmbedBuilder()
        .setColor(0x0000FF)
        .setTitle('"Chris TV 🕊️(@Chris_IP_TV1)"')
        .setDescription('"@Chris_IP_TV\1 Great service, hooked me up with a free trial worked perfect. Great price, no complaints from me"');

        const embed5 = new EmbedBuilder()
        .setColor(0x0000FF)
        .setTitle('"harold (BEST_IPTV_LIVE2)"')
        .setDescription('"Amazon Fire TV Stick 4K Max streaming device"');

        const embed6 = new EmbedBuilder()
        .setColor(0x0000FF)
        .setTitle('"liam ly"')
        .setDescription('"Super TV box, super discount price, please contact me if you need it"')
        .files; ['https://cdn.discordapp.com/attachments/1230243655613419521/1360558728385925250/lArqTFS.mp4?ex=67fb8e8e&is=67fa3d0e&hm=cd387b452f8df260cdead32958fc63a0c3e953644c326eb20627420e6d085471&'];


        pagination.setEmbeds([embed1, embed2, embed3, embed4, embed5, embed6]);
        pagination.render();
    },
};