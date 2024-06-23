const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Web3 = require('web3');
const contractAbi = require('./utils/Pool.json');
const tokenAbi = require('./utils/MEP.json');
const ethers = require('ethers');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
    },
});

const poolContractAddress = process.env.POOL_CONTRACT_ADDRESS;
const mepTokenAddress = process.env.MEP_TOKEN_ADDRESS;
const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;
const ownerAddress = process.env.OWNER_ADDRESS;
const providerUrl = process.env.PROVIDER_URL;

const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
const poolContract = new web3.eth.Contract(contractAbi, poolContractAddress);
const mepToken = new web3.eth.Contract(tokenAbi, mepTokenAddress);

app.use(cors());
app.use(bodyParser.json());

const resolvePool = async (walletAddress, amount, choice) => {
    try {
        const createRoomData = poolContract.methods.resolvePool(walletAddress, amount, choice).encodeABI();
        const gasEstimate = await web3.eth.estimateGas({ from: ownerAddress, to: poolContractAddress, data: createRoomData });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: ownerAddress,
            to: poolContractAddress,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: createRoomData,
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, ownerPrivateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const formattedReceipt = JSON.parse(JSON.stringify(receipt, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));

        const result = Buffer.from(formattedReceipt.logs[1].data.slice(-64).replace(/^0+/, ''), 'hex').toString('utf8');
        io.emit('BetResolved', { walletAddress, amount, choice, result });

        console.log(formattedReceipt);
        return result;
    } catch (error) {
        console.error('Error in resolving pool:', error);
        throw new Error('Error in resolving pool');
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
        const mepTokenContract = new web3.eth.Contract(mepABI, mepTokenAddress);
        const amountInWei = web3.utils.toWei(betAmount.toString(), 'ether') / 10 ** 9;

        const createRoomData = mepTokenContract.methods.transfer(walletAddress, amountInWei).encodeABI();
        const gasEstimate = await web3.eth.estimateGas({ from: ownerAddress, to: mepTokenAddress, data: createRoomData });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: ownerAddress,
            to: mepTokenAddress,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: createRoomData,
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, ownerPrivateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        res.status(200).json({ success: true, receipt });
    } catch (error) {
        console.error('Error in /refund endpoint:', error);
        res.status(500).json({ success: false, msg: 'Refund request failed', err: error.message });
    }
});

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
