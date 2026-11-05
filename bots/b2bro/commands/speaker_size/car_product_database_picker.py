from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ConversationHandler, MessageHandler, CallbackQueryHandler, filters, CommandHandler, ContextTypes
from bots.b2bro.db.car_speaker_db import CarSpeakerDB

from bots.b2bro.config import DB_PATH
from bots.b2bro.commands.helper import cancel

CHOOSING_MODEL, CHOOSE_DOOR = range(2)
AWAITING_DOOR_SELECTION = 11

db = CarSpeakerDB(DB_PATH)

async def start_product_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.message.reply_text("Enter a car model (for example: Mazda 3 2008):")
    return CHOOSING_MODEL

async def handle_model_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_input = update.message.text.strip()
    parts = user_input.split()

    if len(parts) == 1:
        # User entered only the make
        make = parts[0].lower()
        models = db.get_models_by_make(make)

        if not models:
            await update.message.reply_text(
                f"No models found for make '{make}'.\nTry again or enter full format: Make Model Year (e.g. Mazda 3 2008)"
            )
            return CHOOSING_MODEL

        model_list = "\n".join(f"• {model.title()}" for model in models)
        await update.message.reply_text(
            f"Models for '{make.title()}':\n\n{model_list}\n\nEnter a specific model and year like: {make.title()} 3 2008"
        )
        return CHOOSING_MODEL

    elif len(parts) >= 3:
        # User entered full make model year
        car = db.find_car(user_input)
        if not car:
            await update.message.reply_text(
                "No car with this data found.\n"
                "Please enter in the format: Make Model Year\n"
                "For example: Mazda 3 2008"
            )
            return CHOOSING_MODEL

        car_id, make, model, year = car
        context.user_data['car_id'] = car_id

        keyboard = [
            [InlineKeyboardButton("Front door", callback_data="front")],
            [InlineKeyboardButton("Rear door", callback_data="rear")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)

        await update.message.reply_text(
            f"Car found: {make.title()} {model.title()} {year}. Select door type:",
            reply_markup=reply_markup
        )
        return AWAITING_DOOR_SELECTION

    else:
        await update.message.reply_text(
            "Invalid input. Please enter at least the make or the full format: Make Model Year"
        )
        return CHOOSING_MODEL



async def door_button_handler(update, context):
    query = update.callback_query
    await query.answer()

    door_type = query.data
    car_id = context.user_data.get('car_id')
    if not car_id:
        await query.edit_message_text("Error. Start again with /start")
        return ConversationHandler.END

    size = db.get_door_size(car_id, door_type)

    door_name = "Front Doors" if door_type == 'front' else "Rear Doors"
    text = f"{door_name}: {size}"

    if door_type == 'front':
        keyboard = [
            [InlineKeyboardButton("Rear Doors", callback_data="rear")],
            [InlineKeyboardButton("Choose different car model", callback_data="restart_model")]
        ]
    else:
        keyboard = [
            [InlineKeyboardButton("Front Doors", callback_data="front")],
            [InlineKeyboardButton("Choose different car model", callback_data="restart_model")]
        ]

    reply_markup = InlineKeyboardMarkup(keyboard)

    await query.edit_message_text(text, reply_markup=reply_markup)

    return AWAITING_DOOR_SELECTION

async def restart_model_handler(update, context):
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("Choose a car model (for example: Mazda 3 2008):")
    return CHOOSING_MODEL

conv_handler_product_picker = ConversationHandler(
    entry_points=[CallbackQueryHandler(start_product_selection, pattern="^pick_product$")],
    states={
        CHOOSING_MODEL: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_model_input)],
        AWAITING_DOOR_SELECTION: [
            CallbackQueryHandler(door_button_handler, pattern="^(front|rear)$"),
            CallbackQueryHandler(restart_model_handler, pattern="^restart_model$")
        ]
    },
    fallbacks=[CommandHandler("cancel", cancel)],
)
