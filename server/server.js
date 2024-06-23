require('dotenv').config();
const Express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const cors = require('cors');
const { Web3 } = require('web3');
const PoolContractABI = require('./PoolContractABI.json');
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 20; // or a higher number

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_URL));
const contractAddress = process.env.CONTRACT_ADDRESS;
const poolContract = new web3.eth.Contract(PoolContractABI, contractAddress);

const ownerAddress = process.env.OWNER_ADDRESS;
const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;

const app = Express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

app.use(cors())
    .use(Express.json());

io.on("connection", (socket) => {
    socket.on("emitBet", (record) => {
        io.emit("updateHistory", record);
    });
});

const resolvePool = async (walletAddress, amount, choice) => {
    try {
        const createRoomData = poolContract.methods.resolvePool(walletAddress, amount, choice).encodeABI();
        const gasEstimate = await web3.eth.estimateGas({ from: ownerAddress, to: contractAddress, data: createRoomData });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: ownerAddress,
            to: contractAddress,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: createRoomData,
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, ownerPrivateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const formattedReceipt = JSON.parse(JSON.stringify(receipt, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));
        
        return formattedReceipt;
    } catch (error) {
        console.error('Error in resolving pool:', error);
        throw new Error('Error in resolving pool');
    }
};

const refund = async (walletAddress, amount) => {
    try {
        const createRoomData = poolContract.methods.refund(walletAddress, amount).encodeABI();
        const gasEstimate = await web3.eth.estimateGas({ from: ownerAddress, to: contractAddress, data: createRoomData });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: ownerAddress,
            to: contractAddress,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: createRoomData,
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, ownerPrivateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const formattedReceipt = JSON.parse(JSON.stringify(receipt, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));

        return `${amount} $MEP refunded to ${walletAddress}`;
    } catch (error) {
        console.error('Error in refunding pool:', error);
        throw new Error('Error in refunding pool');
    }
};

app.post('/distribute', async (req, res) => {
    try {
        const { walletAddress, betAmount, choice } = req.body;
        console.log(walletAddress, betAmount, choice);
        const response = await resolvePool(walletAddress, betAmount, choice);
        res.status(200).json({ success: true, response });
    } catch (err) {
        console.error('Error in /distribute endpoint:', err);
        res.status(500).json({ success: false, msg: 'Transfer request failed', err: err.message });
    }
});

app.post('/refund', async (req, res) => {
    try {
        const { walletAddress, betAmount } = req.body;
        const response = await refund(walletAddress, betAmount);
        res.status(200).json({ success: true, response });
    } catch (err) {
        console.error('Error in /refund endpoint:', err);
        res.status(500).json({ success: false, msg: 'Refund request failed', err: err.message });
    }
});

const PORT = process.env.PORT;

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

// Set up event listener for BetResolved
poolContract.events.BetResolved({
    fromBlock: 'latest'
}, (error, event) => {
    if (error) {
        console.error('Error on event', error);
    } else {
        const result = event.returnValues.result;
        console.log('BetResolved event result:', result);
    }
});
