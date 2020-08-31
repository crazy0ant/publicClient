import {getProtooUrl,iceServer} from './urlFactory'
import protooClient from "protoo-client";
import randomString from 'random-string';
import adapter from 'webrtc-adapter';

export default class MasterClient {

    constructor({roomId, maxBandWidth}) {
        this._roomId = roomId;
        this._peerId = randomString({length:8}).toLowerCase();
        this._protoo = null;
        this._protooUrl = getProtooUrl({roomId, peerId:this._peerId});
        this._roomState = 'init'; //init connecting open closed
        this._isDisplayMedia = true;
        this._localStream = null;
        this._pcs = new Map();
        this._maxBandWidth = maxBandWidth?maxBandWidth:1000;//默认1000kbps
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
            console.error('连接失败')
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
                    let pc = this._pcs.get(peerId);
                    if(pc){
                        pc.close();
                        pc = null;
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
                            const desc = message.data;
                            if(pc){

                                pc.setRemoteDescription(desc).then(()=>{
                                    setTimeout(()=>{
                                        this._setMaxBandwidth(pc,this._maxBandWidth);
                                    },1000)
                                });

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
                        width         : {max: '1920'},
                        height        : {max:'1080'},
                        frameRate     : {max:20}
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
            //2.绑定track
            this._localStream.getTracks().forEach(track=>pc.addTrack(track,this._localStream));




            //3.创建desc
            const offerDesc = await pc.createOffer({offerToReceiveAudio:1,offerToReceiveVideo:1});
            console.log('offerDesc',offerDesc);
            await pc.setLocalDescription(offerDesc);
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
    _setMaxBandwidth(pc,bandwidth){
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                const desc = {
                    type: pc.remoteDescription.type,
                    sdp: this._updateBandwidthRestriction(pc.remoteDescription.sdp, bandwidth)
                };
                console.log('Applying bandwidth restriction to setRemoteDescription:\n' +
                    desc.sdp);
                return pc.setRemoteDescription(desc);
            })
            .then(() => {
                console.log('limit bandwidth ok.')
            })
            .catch(()=>console.error('limit bandwidth err.'));
    }
    _updateBandwidthRestriction(sdp, bandwidth) {
        let modifier = 'AS';
        if (adapter.browserDetails.browser === 'firefox') {
            //>>>无符号右移，大于0的数值位运算后结果不变，任何非数值变量做此运算都会变为0
            bandwidth = (bandwidth >>> 0) * 1000;
            modifier = 'TIAS';
        }
        if (sdp.indexOf('b=' + modifier + ':') === -1) {
            // insert b= after c= line.
            sdp = sdp.replace(/c=IN (.*)\r\n/, 'c=IN $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
        } else {
            sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
        }
        return sdp;
    }

}
