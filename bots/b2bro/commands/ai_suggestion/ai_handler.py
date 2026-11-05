import logging
import pandas as pd
import openai
from telegram import Update, Document
from bots.b2bro.config import OPENAI_API_KEY, OFFER_FILE_PATH
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes, ConversationHandler, \
    CallbackQueryHandler

from bots.b2bro.commands.helper import cancel

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

openai.api_key = OPENAI_API_KEY
CHOOSING_CATEGORY = 1

async def start_category_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.message.reply_text("Please type the product or product category you want recommendations for.")
    return CHOOSING_CATEGORY

def read_table(file_path):
    try:
        if file_path.endswith(".xlsx"):
            df = pd.read_excel(file_path)
        else:
            raise ValueError("Unsupported file format. Please use .xlsx")
    except Exception as e:
        logger.error(f"Failed to read file {file_path}: {e}")
        raise

    # Normalize column names
    df.rename(columns={
        "Artikel": "SKU",
        "Artikelomschr": "Product Name",
        "Price": "Price",
        "Available": "Stock"
    }, inplace=True)

    return df[["SKU", "Product Name", "Price", "Stock"]]


def ask_gpt(df: pd.DataFrame, top_n: int = 5):
    if df.empty:
        return "No products to analyze."

    sample = df.head(20).to_csv(index=False)

    system_prompt = "You are a helpful AI assistant analyzing retail products to choose the most attractive ones."

    user_prompt = f"""
Choose {top_n} products that are likely to be most attractive to customers.
You have access to the product name, price, and stock availability.

Factors to consider:
- Brand familiarity and desirability
- Price point vs perceived value
- Demand and general appeal
- Reasonable stock

Provide your top picks with short comments.

Here is the table:
{sample}
"""

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.5,
        max_tokens=600
    )
    return response.choices[0].message["content"]

#change product finding in xlsx
async def handle_internal_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_input = update.message.text.strip().lower()
    file_path = OFFER_FILE_PATH

    try:
        df = read_table(file_path)

        # Check columns
        if not {"Product Name", "Price"}.issubset(df.columns):
            await update.message.reply_text("The internal file must have 'Product Name' and 'Price' columns.")
            return

        # Filter dataframe by user input (case-insensitive contains in Product Name)
        filtered_df = df[df['Product Name'].str.lower().str.contains(user_input)]

        if filtered_df.empty:
            await update.message.reply_text(f"No products found matching '{user_input}'. Try another keyword.")
            return

        # Ask GPT with filtered data
        answer = ask_gpt(filtered_df)
        await update.message.reply_text(answer)

    except Exception as e:
        logger.error(e)
        await update.message.reply_text("Failed to process the internal file. Check formatting and path.")


conv_handler_ai_assistant = ConversationHandler(
    entry_points=[CallbackQueryHandler(start_category_selection, pattern="^ai_suggestion$")],
    states={
        CHOOSING_CATEGORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_internal_file)],
    },
    fallbacks=[CommandHandler("cancel", cancel)],
)
