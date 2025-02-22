const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  DefaultWebSocketManagerOptions,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { Pagination } = require("pagination.djs");

const { initDB } = require("./db/utils");

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error("DISCORD_TOKEN or CLIENT_ID is missing!");
  process.exit(1);
}

initDB();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"],
});

client.commands = new Collection();
const commands = [];

function loadCommands(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const filePath = path.join(dir, item.name);
    if (item.isDirectory()) {
      loadCommands(filePath);
    } else if (item.name.endsWith(".js")) {
      const command = require(filePath);
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      }
    }
  }
}

loadCommands(path.join(__dirname, "commands"));

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
  } catch (error) {
    console.error(error);
  }
})();

client.once(Events.ClientReady, (c) => {
  const now = new Date();
  const utcString = now.toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${utcString}] ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isModalSubmit()) {
      const commandName = interaction.customId.split(":")[0];
      const command = client.commands.get(commandName);
      if (command && typeof command.handleModal === "function") {
        try {
          await command.handleModal(interaction);
        } catch (error) {
          console.error(error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "There was an error processing your input.",
              ephemeral: true,
            });
          }
        }
      }
    } else if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error executing this command!",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "There was an error executing this command!",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.isButton()) {
      const commandName = interaction.customId.split(":")[0];
      const command = client.commands.get(commandName);
      if (command && typeof command.handleButton === "function") {
        try {
          await command.handleButton(interaction);
        } catch (error) {
          console.error(error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "There was an error processing your request.",
              ephemeral: true,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(
      "An unexpected error occurred in the interaction handler:",
      error
    );
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "An unexpected error occurred while processing your request.",
        ephemeral: true,
      });
    }
  }
});

DefaultWebSocketManagerOptions.identifyProperties.browser = "Discord Android";
client.login(process.env.DISCORD_TOKEN).catch(console.error);
