import {getProtooUrl} from './urlFactory'
import protooClient from "protoo-client";
import randomString from 'random-string';
export default class MasterClient {

    constructor({roomId,peerId}) {
        this._roomId = roomId;
        if(peerId){
            this._peerId = peerId;
        }else{
            this._peerId = randomString({length:8}).toLowerCase();
        }

        this._protoo = null;
        this._protooUrl = getProtooUrl({roomId, peerId:this._peerId});
        this._roomState = 'init'; //init connecting open closed
    }

    async join(){

        this._roomState = 'connecting';
        const protooTransport = new protooClient.WebSocketTransport(this._protooUrl);

        this._protoo = new protooClient.Peer(protooTransport);

        this._protoo.on('open',()=>{
            this._roomState = 'open';
            console.log('已连接');
            this._joinRoom();
        });
        this._protoo.on('failed',()=>{
            console.err('连接失败')
        });
        this._protoo.on('disconnected',()=>{
            console.log('连接已断开')
        });
        this._protoo.on('request', async (request, accept, reject)=>{

            switch(request.method){

            }
        });
        this._protoo.on('notification',  (notification)=>{
            console.log('notification::',notification)
            switch(notification.method){
                case 'newPeer':
                {

                }
            }
        });
    }


    async _joinRoom(){
        const { peers } = await this._protoo.request(
            'join',
            {
                displayName: this._peerId,
                isMaster: true,
            }
        );
        console.log({ peers });
    }

    async sendMsg(text){

        this._protoo.request(
            'forwardMsg',
            {textData:text}
        );
    }
}
