/**
 * home made object store.
*/
define(["dojo/_base/declare", "dojo/_base/lang", "dojo/_base/Deferred",
        "dojo/store/util/QueryResults","dojo/_base/array"],
    function(declare, lang, Deferred, QueryResults,baseArray) {
		var indexedDB=window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
		var IDBTransaction=window.IDBTransaction||window.webkitIDBTransaction;
		var IDBKeyRange=window.IDBKeyRange||window.webkitIDBKeyRange;
		var IDBCursor=window.IDBCursor||window.webkitIDBCursor;
    return declare(null, {
        // databaseName: String
        databaseName:"dojoDatabase",
        
        // storeName: String
        storeName:"dojoStore",
        
        // autoIncrementId: Boolean
        autoIncrementId:true,
        
        // indexNames: string array
        indexNames:null,
        
        // idProperty: String
        //		Indicates the property to use as the identity property. The values of this
        //		property should be unique.
        idProperty: "id",
        
        _database:null,
        
        constructor: function(/*IndexedDb*/ options){
            // summary:
            //		IndexedDB based object store. it works only on Chrome, may work on others but not tested.
        	//e.g. mytable=new IndexedDb({databaseName:"mydatabase",storeName:"mytable",indexNames:["field1"]});
        	//	   mytable.put({id:2,field1:"I'm field1"});mytable.put({field1:"I'm field1 too"});
        	//	   mytable.get(2);
        	if (!indexedDB){
        		throw new Error("IndexedDB not available on this browser");
        	}
        	this.indexNames=[];
         	this._database=new Deferred();
            lang.mixin(this, options);
		
        	//create the store if it hasn't existed.
        	var request1=indexedDB.open(this.databaseName);
        	request1.onerror=lang.hitch(this,function(evt){this._database.reject(evt.target.errorCode);});
        	request1.onsuccess=lang.hitch(this,function(evt){
        		var db1=evt.target.result;
        		var found=false;
        		if(db1.objectStoreNames.contains(this.storeName)){
        			found=true;
        		}
        		console.log(this.storeName+" store found?"+found);
        		console.log("current version - "+db1.version);
        		var nextVersion=(db1.version&&(parseInt(db1.version)+1))||2;//2 is the first version.
        		if(!found){   
        			db1.close();
        			var request2=indexedDB.open(this.databaseName,nextVersion);
        			request2.onerror=lang.hitch(this,function(evt){this._database.reject(evt.target.errorCode);});
        			request2.onupgradeneeded=lang.hitch(this,function(evt){this.upgradeSchema(evt.target.result);});
        			request2.onsuccess=lang.hitch(this,function(evt){
        				//old chrome won't call onupgradeneeded
        				var db2=evt.target.result;
        				var found2=false;
        				if(db2.objectStoreNames.contains(this.storeName)){
        					found2=true;
        				}
        				if(!found2){
        					if(db2.setVersion){
	        					db2.setVersion(nextVersion).onsuccess=lang.hitch(this,function(evt){
	        						this.upgradeSchema(evt.target.result.db);
	        						db2.close();
	        						indexedDB.open(this.databaseName).onsuccess=lang.hitch(this,function(evt){this._database.resolve(evt.target.result);});	        						
	        					});
        					}else{
        						db2.close();
        						var returnError=new Error("Failed to create object store.");
        						this._database.reject(returnError);
        					}
        				}else{
        					db2.close();
        					indexedDB.open(this.databaseName).onsuccess=lang.hitch(this,function(evt){this._database.resolve(evt.target.result);});
        				}
        			});        			
        		}else{
        			this._database.resolve(db1);
        		}        		
        	});
            this.setData(this.data || []);
        },
        
        upgradeSchema:function(db){
        	console.log("upgrade schema");
			var objectStore=db.createObjectStore(this.storeName,
					{keyPath:this.idProperty,autoIncrement: this.autoIncrementId});
			baseArray.forEach(this.indexNames, function(item, index){
				objectStore.createIndex(item,item,{ unique: false });
			});
        },
        get: function(id){
            //	summary:
            //		Retrieves an object by its identity
            //	id: Number
            //		The identity to use to lookup the object
            //	returns: a promise
            //		The promise value is the object the store that matches the given id.
        	var def=new Deferred();
        	if(!id){
        		def.reject("invalid Id");
        		return def;
        	}
        	Deferred.when(this._database,lang.hitch(this,function(db){
        		var transaction=db.transaction(this.storeName);//by default, read only
    			var store=transaction.objectStore(this.storeName);
    			var request=store.get(id);
    			request.onerror=function(evt){
    				def.reject("no such object");
    			};
    			request.onsuccess=function(evt){
    				var finalObject=request.result;
    				def.resolve(finalObject);
    			}        		
        	}));
            return def;
        },
        getIdentity: function(object){
            // 	summary:
            //		Returns an object's identity
            // 	object: Object
            //		The object to get the identity from
            //	returns: Number
            return object[this.idProperty];
        },
        put: function(object, options){
            // 	summary:
            //		Stores an object
            // 	object: Object
            //		The object to store.
            // 	options: Object?
            //		Additional metadata for storing the data.  Includes an "id"
            //		property if a specific id is to be used.
            //	returns: a promise - its value is id
        	
        	var def=new Deferred();
        	Deferred.when(this._database,lang.hitch(this,function(db){
        		var transaction=db.transaction(this.storeName,IDBTransaction.READ_WRITE);        		
    			var store=transaction.objectStore(this.storeName);
    			if(options&&options.id){
    				object[this.idProperty]=options.id;
    			}    			
    			var request=store.put(object);
    			request.onerror=function(evt){
    				def.reject("failed to add/update this object");
    			};
    			request.onsuccess=function(evt){
    				var objectId=evt.target.result;
    				def.resolve(objectId);
    			}
        	}));
            return def;
        },
        add: function(object, options){
            // 	summary:
            //		Creates an object, throws an error if the object already exists
            // 	object: Object
            //		The object to store.
            // 	options: Object?
            //		Additional metadata for storing the data.  Includes an "id"
            //		property if a specific id is to be used.
            //	returns: a promise  - its value is id
        	var def=new Deferred();
    		Deferred.when(this.get(object[this.idProperty]),function(getObject){
        		def.reject("Object already exists.");
        	},lang.hitch(this,function(error){
        		//actually it's good
        		Deferred.when(this._database,lang.hitch(this,function(db){
            		var transaction=db.transaction(this.storeName,IDBTransaction.READ_WRITE);        		
        			var store=transaction.objectStore(this.storeName);
        			if(options&&options.id){
        				object[this.idProperty]=options.id;
        			}    			
        			var request=store.add(object);
        			request.onerror=function(evt){
        				def.reject("failed to add this object");
        			};
        			request.onsuccess=function(evt){
        				var objectId=evt.target.result;
        				def.resolve(objectId);
        			}
            	}));
        	}));	
            return def;
        },
        remove: function(id){
            // 	summary:
            //		Deletes an object by its identity
            // 	id: Number
            //		The identity to use to delete the object
            //	returns: a promise  - its value is true if successful.other its false        	
        	var def=new Deferred();
        	if(!id){
        		def.reject("Invalid Id");
        		return def;
        	}
        	Deferred.when(this._database,lang.hitch(this,function(db){
        		var transaction=db.transaction(this.storeName,IDBTransaction.READ_WRITE);        		
    			var store=transaction.objectStore(this.storeName);			
    			var request=store.delete(id);
    			request.onerror=function(evt){
    				def.reject("error "+evt);
    			};
    			request.onsuccess=function(evt){
    				def.resolve(true);
    			}
        	}));
        	return def;
        },
        query: function(query, options){
    		// summary:
    		//		Queries the store for objects. only one sort/index supported.
        	//		use query to create the range of the cursor to be done.
    		// query: Object
    		//		The query to use for retrieving objects from the store.
    		//	options: dojo.store.api.Store.QueryOptions?
    		//		The optional arguments to apply to the resultset.
    		//	returns: dojo.store.api.Store.QueryResults
    		//		The results of the query, extended with iterative methods.
        	console.dir(options);
        	console.dir(query);
        	
    		options = options || {};
    		var def=new Deferred();
    		def.total=new Deferred();
    		
    		var indexName=null;
    		var indexDirection=IDBCursor.NEXT;
    		if(options && options.sort){
    			var sort=options.sort[0];
    			indexName=sort.attribute;
    			if(sort.descending){
    				indexDirection=IDBCursor.PREV;
    			}
    		}
    		
    		var start=options.start||0;    		
    		var count=options.count||20;    		
    		var objectArray=[];
    		
    		
			Deferred.when(this._database,lang.hitch(this,function(db){
				var cursorIndex=0;
        		var transaction=db.transaction(this.storeName);//by default, read only
    			var store=transaction.objectStore(this.storeName);
    			var request=null;
    			if(indexName){
    				request=store.index(indexName).openCursor(null,indexDirection);
    			}else{
    				request=store.openCursor(null,indexDirection);
    			}
    			request.onerror=function(evt){
    				objectArray.total=0;
    				def.total.resolve(0);
    				def.resolve(objectArray);
    			};
    			request.onsuccess=function(evt){
    				var cursor=event.target.result;
    				if(!cursor){
    					def.total.resolve(cursorIndex);
    					def.resolve(objectArray);        					
    					return;
    				}
    				if(cursorIndex>=start&&cursorIndex<(start+count)){
    					var object=cursor.value;
        				objectArray.push(object);	
    				}
    				cursorIndex=cursorIndex+1;
    				cursor.continue();
    			};        		
        	}));
			
    		return QueryResults(def);
        },
        setData: function(data){
            // 	summary:
            //		Sets the given data as the source for this store, and indexes it
            //	data: Object[]
            //		An array of objects to use as the source of data.
            if(data.items){
                // just for convenience with the data format IFRS expects
                this.idProperty = data.identifier;
                data = this.data = data.items;
            }

            for(var i = 0, l = data.length; i < l; i++){
                var object = data[i];
                this.put(object);
            }
        }
    });
});
