import ccxt
import pandas as pd

# Connect to Binance API
exchange = ccxt.binance()

# Fetch historical data (e.g., BTC/USDT 1-hour candles)
symbol = 'BTC/USDT'
timeframe = '1h'
limit = 100
ohlcv = exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

# Convert to a DataFrame
data = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

# Convert timestamp to readable date
data['timestamp'] = pd.to_datetime(data['timestamp'], unit='ms')
