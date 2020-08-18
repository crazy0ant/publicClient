import {getProtooUrl,iceServer} from './urlFactory'
import protooClient from "protoo-client";
import randomString from 'random-string';
//import adapter from 'webrtc-adapter';

export default class UserClient {

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
        this.masterPeer = null;
        this.localStream = new MediaStream();
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
                    break;
                }
                case 'mediaMsg':
                {
                    break;
                }
                case 'forwardToOne':
                {
                    const {peerId,message} = notification.data;

                    switch (message.type) {
                        case 'offer':
                        {
                            //创建pc
                            //生成answer
                            //发送answer
                            this.createPeerConnection(peerId,message.data);
                        }
                        case 'candidate':
                        {
                            this.pc.addIceCandidate(message.data)
                            break;
                        }
                    }
                    break;
                }
            }
        });
    }


    async _joinRoom(){
        const { peers } = await this._protoo.request(
            'join',
            {
                displayName: this._peerId,
                isMaster: false,
            }
        );
        //遍历peers数组，取出masterPeer
        if(peers){
            for(let i=0;i<peers.length;i++){
                if(peers[i].isMaster){
                    this.masterPeer = peers[i];
                }
            }
        }
        console.log({ peers });
    }

    async sendMsg(text){

        /*this._protoo.request(
            'forwardMsg',
            {textData:text}
        );*/
        this._protoo.request(
            'forwardToOne',
            {peerId:this.masterPeer.id, message:text}
        );
    }

    async createPeerConnection(peerId,offer){
        //1.创建pc
        const pc = new RTCPeerConnection(iceServer);
        pc.onicecandidate= (event)=>{
            console.log('onicecandidate',event)
            if(event.candidate){
                //发送RTCPeerConnectionEvent,对方收到后调用pc.addIceCandidate
                const message = {
                    type:'candidate',
                    data:event.candidate
                }
                this._protoo.request(
                    'forwardToOne',
                    {peerId:peerId, message:message}
                );
            }

        }
        pc.ontrack=(e)=>{
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.srcObject = e.streams[0];
        }

        //2.绑定track
        this.localStream.getTracks().forEach(track=>pc.addTrack(track,this.localStream));

        await pc.setRemoteDescription(offer);
        //3.创建desc前先设置remote
        const answerDesc = await pc.createAnswer();
        console.log('answerDesc',answerDesc);
        await pc.setLocalDescription(answerDesc);

        //4.发送answer,对方收到后调用pc.setRemote
        const message = {
            type:'answer',
            data:answerDesc
        }
        this._protoo.request(
            'forwardToOne',
            {peerId:peerId, message:message}
        );
        this.pc = pc;
    }
}
