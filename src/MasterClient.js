import {getProtooUrl,iceServer} from './urlFactory'
import protooClient from "protoo-client";
import randomString from 'random-string';
//import adapter from 'webrtc-adapter';

export default class MasterClient {

    constructor({roomId}) {
        this._roomId = roomId;
        this._peerId = randomString({length:8}).toLowerCase();
        this._protoo = null;
        this._protooUrl = getProtooUrl({roomId, peerId:this._peerId});
        this._roomState = 'init'; //init connecting open closed
        this._isDisplayMedia = true;
        this._localStream = null;
        this._pcs = new Map();
        window.pcs = this._pcs;
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
                    console.log('newPeer')
                    const {id,displayName,isMaster} = notification.data;
                    //创建pc，发送offer
                    this.createPeerConnection(displayName);
                }
                case 'peerClosed':
                {
                    console.log('peerClosed')
                    const {peerId} = notification.data;
                    const pc = this._pcs.get(peerId);
                    if(pc){
                        pc.close();
                        this._pcs.delete(peerId);
                    }

                }
                case 'forwardToOne':
                {
                    const {peerId,message} = notification.data;
                    //message.type
                    switch (message.type) {
                        case 'answer':
                        {
                            //answer:message.data
                            const pc = this._pcs.get(peerId);
                            if(pc){
                                pc.setRemoteDescription(message.data);
                            }
                            break
                        }
                        case 'candidate':
                        {
                            const pc = this._pcs.get(peerId);
                            const candidate = message.data;

                            pc.addIceCandidate(candidate);
                            break;
                        }
                    }
                    break;
                }
            }
        });
    }


    async _joinRoom(){
        try{
            const { peers,err } = await this._protoo.request(
                'masterJoin',
                {
                    displayName: this._peerId,
                    isMaster: true,
                }
            );
            if(err){
                console.log('加入失败',err);
            }else{
                await this.getLocalMedia();
            }
        }catch (e) {
            console.error('_joinRoom error',e)
        }

    }

    async sendMsg(text){

        this._protoo.request(
            'forwardMsg',
            {textData:text}
        );
    }

    async getLocalMedia(){
        try{
            if(this._isDisplayMedia){
                //采集屏幕
                this._localStream = await navigator.mediaDevices.getDisplayMedia({
                    audio: false,
                    video:{
                        displaySurface: 'monitor',
                        logicalSurface: true,
                        cursor        : true,
                        width         : {max: 1920},
                        height        : {max:1080},
                        frame         : {max:30}
                    }
                });

            }else{
                //使用摄像头
                this._localStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: true
                })
            }
        }catch (e) {
            console.error('getLocalMedia error',e)
        }
    }

    async createPeerConnection(peerId){
        try{
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

            //2.绑定track
            this._localStream.getTracks().forEach(track=>pc.addTrack(track,this._localStream));
            //3.创建desc
            const offerDesc = await pc.createOffer({offerToReceiveAudio:1,offerToReceiveVideo:1});
            console.log('offerDesc',offerDesc);
            await pc.setLocalDescription(offerDesc);
            //4.发送offer,对方收到后调用pc.setRemote
            const message = {
                type:'offer',
                data:offerDesc
            }
            this._protoo.request(
                'forwardToOne',
                {peerId:peerId, message:message}
            );
            this._pcs.set(peerId,pc);
        }catch (e) {
            console.error('createPeerConnection error',e)
        }

    }

}
