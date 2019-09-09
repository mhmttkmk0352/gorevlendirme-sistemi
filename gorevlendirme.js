const base64 = require("js-base64").Base64;
const fs = require("fs");
const express = require("express");
const app = express();
const http = require("http");
const https = require("https");
const redirecthttps = require("redirect-https");
const MongoClient = require("mongodb").MongoClient;
const ObjectID = require("mongodb").ObjectID;
const config = require("./config.js");
const httpsOptions = {
	ca: fs.readFileSync("../sslverisi/CER-CRT-Files/My_CA_Bundle.ca-bundle"),
	cert: fs.readFileSync("../sslverisi/CER-CRT-Files/test_test_com.crt"),
	key: fs.readFileSync("../sslverisi/ek/test.test.com.key")
}


var httpServer = http.createServer(redirecthttps({port: 8104}));
var httpsServer = https.createServer(httpsOptions, app);


const io = require("socket.io").listen(httpsServer);


httpServer.listen(8103, function(){
	console.log("8103 | HTTP | Dinlemede");
});

httpsServer.listen(8104, function(){
	console.log("8104 | HTTPS | Dinlemede");
});


var idHavuzu = {};
var sidHavuzu = {};



MongoClient.connect(config.bilgiGetir(), {useNewUrlParser: true}, function(mongoerr, mongores){



	if (mongoerr) throw mongoerr;
	console.log("Mongo Bağlantısı Başarılı");
	var vt = mongores.db("gorevlendirme");


	app.get("/", function(req, res){
		console.log("Test sayfası");
		res.send("Test");
	});

	app.post("/uyeekle", function(req, res){
		console.log("UyeEkle içine veri geldi");

		var id =  Base64.decode(req.query.id);
		var ad = Base64.decode(req.query.ad);

		if (!id || !ad || id.length<1 || ad.length<1){
			res.send("Id veya ad girilmedi !");
			return false;
		}

		if (!idHavuzu[id]){
			idHavuzu[id] = {sidler: []}
			idHavuzu[id].sidler.push(s.id);
		}
		else{
			idHavuzu[id].sidler.push(s.id);
		}

		

		vt.collection("gorevler").find({}).sort({_id: -1}).limit(50).toArray(function(err, res){
			if (res){
				vt.collection("uyeler").updateOne({id: id}, {$set:{ad: ad}});
			}
			else{

				vt.collection("uyeler").insertOne({id:id, ad:ad});
			}
		});


		res.send(req.query);
	});



	io.on("connection", function(s){



		s.on("disconnect", function(){

			if (sidHavuzu[s.id] && sidHavuzu[s.id].id){
				var idim = sidHavuzu[s.id].id;
				var a = idHavuzu[idim].sidler.indexOf(s.id);
				idHavuzu[idim].sidler.splice(a,1);
				delete sidHavuzu[s.id];
			}
		

		});


		s.on("tumgorevlerimiGetir", function(data){
			console.log("tumgorevlerimiGetir");
			console.log(data);
			vt.collection("gorevler").find({}).sort({_id: -1}).limit(50).toArray(function(err, res){
				s.emit("tumgorevlerimiGetir", {
					gorevler: res
				});
			});
		});

		s.on("grvMasterIlkGiris", function(data){
			console.log("grvMasterIlkGiris: ");

			if(!data.id || !data.ad){
				return false;
			}

			if (!idHavuzu[data.id]){
				idHavuzu[data.id] = {ad:data.ad,sidler: []} 
			}
			else{
				idHavuzu[data.id]["sidler"].push(s.id);
				sidHavuzu[s.id] = {id:data.id, ad:data.ad};

			}


			vt.collection("gorevler").find({}).sort({_id: -1}).limit(50).toArray(function(err, res){



				if (res){

					res.forEach(function(v,k){

		

						if ( v.gorulmedurum == 0 ){

							s.emit("okunmamisgorev", {
								gorevler: res,
								baslik: "Okunmamış Görev",
								mesaj: "Henüz okunmamış göreviniz var",
								gorulmedurum: 1
							});

							return false;

						}


						
					});

				}

			});

		});
		s.on("gorevEkle", function(data){
			console.log(data);
			var durum = 0;

			var baslangic = new Date().getTime();
			var eklenen = {gorevveren: data.gorevveren, gorevbasligi: data.gorevbasligi, gorevaciklamasi:data.gorevaciklamasi, gorevalan:data.gorevalan, baslangic:baslangic, gorevdurum: "beklemede", gorulmedurum: 0}

			vt.collection("gorevler").insertOne(eklenen, function(err, res){


				if (err){
					durum = 0;
					s.emit("gorevEkle", {
						durum:durum,
						baslik:"Hata",
						mesaj: "Görev ekleme işlemi başarısız !",
						type: "error"
					});


				}else{
					durum = 1;
					s.emit("gorevEkle", {
						durum:durum,
						baslik: "Başarılı",
						mesaj: "Görev başarı ile eklendi",
						type: "success",
						eklenen: eklenen
					});



					if (idHavuzu && idHavuzu[data.gorevalan] && idHavuzu[data.gorevalan].sidler && idHavuzu[data.gorevalan].sidler.length>0){
						console.log(data.gorevalan+ " idye sahip kişi görev aldı." );


						var sidlerim = idHavuzu[data.gorevalan].sidler;
						sidlerim.forEach(function(v,k){
							console.log(v+" içine veri gitti.");
							if (data.gorevveren != sidHavuzu[v].id){
								io.to(v).emit("birgorevinvar", {
									baslik: "Görev Bildirimi",
									mesaj: "Yeni bir görev bildirimi aldınız..",
									_id: res.insertedId,
									data:data
								});							
							}

						});
					}

					console.log("Görev ekleme durumu:");
					console.log(durum);
					console.log(data);				
				}

			});
		});

		s.on("birgorevinvar", data=>{
			console.log("birgorevinvar ON:");

			console.log("Görev karşıdaki kişi tarafından görüldü");

			console.log("Bu kişiye ait sid:");
			console.log(data);
			console.log(s.id);
			if (sidHavuzu && sidHavuzu[s.id] && sidHavuzu[s.id].id){
				console.log("id: "+sidHavuzu[s.id].id);
				vt.collection("gorevler").find({gorevalan: sidHavuzu[s.id].id}).toArray((err,res)=>{
					console.log("Bu kişiye ait görevler:");
			
					if (res && res.length>0){
						res.forEach((v,k)=>{
							if (v._id && v._id != ""){
								vt.collection("gorevler").updateOne({_id: ObjectID(v._id)}, {$set: {gorulmedurum: 1}})
							}
						});
					}
				});
			}
			//vt.collection("gorevler").updateOne({_id: ObjectID(data.data._id)}, {$set: {gorulmedurum: 1}});
		});

		s.on("gorevlerimiGetir", function(data){
			console.log("Görevlerimi getirme isteği alındı");
			console.log(data);
			vt.collection("gorevler").find({gorevalan: data.id}).sort({_id: -1}).limit(200).toArray(function(err, res){
				if (!err){
					s.emit("gorevlerimiGetir", {
						gorevler: res
					});
					
				}
			});
		});
		s.on("islemeal", function(data){
			
			console.log("islemeal ON:");
			console.log(data);
			vt.collection("gorevler").updateOne({_id: ObjectID(data._id)}, {$set: {gorevdurum: "işleme alındı"}});
	
			console.log("Güncelleme başarılı");
			s.emit("islemeal","");
			io.emit("birKisiGoreviIslemeAldi", {
				_id: data._id,
				gorevdurum: "işleme alındı"
			});
	
		});
		s.on("tamamlandi", function(data){

			console.log("tamamlandi ON:");
			console.log(data);			
			 vt.collection("gorevler").updateOne({_id: ObjectID(data._id)}, {$set: {gorevdurum: "Tamamlandı"}});
			console.log("Güncelleme başarılı");

			s.emit("tamamlandi", "");	
			io.emit("birKisiGoreviTamamladi", {
				_id: data._id,
				gorevdurum: "Tamamlandı"
			});					
			
		});
		s.on("testediliyor", function(data){
			console.log("testediliyor ON:");
			console.log(data);
			 vt.collection("gorevler").updateOne({_id: ObjectID(data._id)}, {$set: {gorevdurum: "Test Ediliyor"}});
			console.log("Güncelleme başarılı");

			s.emit("testediliyor", "");	
			io.emit("birKisiGoreviTestEdiyor", {
				_id: data._id,
				gorevdurum: "Test Ediliyor"
			});					
			
		});

	
	});




});
