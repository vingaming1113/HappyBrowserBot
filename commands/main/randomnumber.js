const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomnumber')
        .setDescription('Generates a random number')
        .addNumberOption(option =>
            option.setName('startnumber')
                .setDescription('The starting number')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('endnumber')
                .setDescription('The ending number')
                .setRequired(true))
        .setContexts(0, 1, 2),
    async execute(interaction) {
        const startNumber = interaction.options.getNumber('startnumber');
        const endNumber = interaction.options.getNumber('endnumber');

        if (startNumber === null || endNumber === null) {
            return interaction.reply('Please provide both start and end numbers.');
        }

        if (startNumber >= endNumber) {
            return interaction.reply('The start number must be less than the end number.');
        }

        const randomNumber = Math.floor(Math.random() * (endNumber - startNumber + 1)) + startNumber;
        await interaction.reply(`Your random number is: ${randomNumber}`);
    },
};
