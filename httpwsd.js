/* This file is part of AToMPM - A Tool for Multi-Paradigm Modelling
*  Copyright 2011 by the AToMPM team and licensed under the LGPL
*  See COPYING.lesser and README.md in the root of this project for full details
*/

/*********************************** IMPORTS **********************************/
const process = require('node:process');
const _cp = require('node:child_process'),
	_fs = require('fs'),
	_http = require('http'),
	_url = require('url'),
	_duri = require('./___dataurize'),
	_fspp = require('./___fs++'),
	logger = require('./logger'),
	_utils = require('./utils');
const session_manager = require("./session_manager");

// Command line flag:
const runWithPythonChildProcess = !(process.argv.slice(2).includes("--without-child")); // default is true

const port = 8124;


/** Wrapper function to log HTTP messages from the server **/
function __respond(response, statusCode, reason, data, headers)
{
	logger.http("http _ 'respond' <br/>" + statusCode,{'from':"server",'to':"client"});
	_utils.respond(response, statusCode, reason, data, headers);
}

/******************************* PARAMETERIZATION ******************************/

const argv = require('minimist')(process.argv.slice(2));
if (argv["log"]){
	const level = argv["log"].toUpperCase();
	if (logger.LOG_LEVELS[level] != undefined){
		logger.set_level(logger.LOG_LEVELS[level]);
	}else{
		console.log("WARNING - Unknown logger level: " + level);
		console.log("Valid values: ");
		console.log(logger.return_level_names());
	}
}


/************************************ LOGIC ***********************************/
let httpserver = _http.createServer(
		function(req, resp) 
		{
			var url = _url.parse(req.url,true);
			url.pathname = decodeURI(url.pathname);

			logger.http("http <br/>" + req.method + "<br/>" + url.path ,{'from':"client",'to':"server",'type':"-)"});

			/* serve client */
			if( req.method == 'GET' && url.pathname == '/atompm' )
				_fs.readFile('./client/atompm.html', 'utf8',
					function(err, data)
					{
						if(err) 
							__respond(resp,500,String(err));
						else
							__respond(resp,200,'',data,{'Content-Type': 'text/html'});
					});
                    
			else if( req.method == 'GET' && url.pathname == '/favicon.png' )
				_fs.readFile('./favicon.png', 'binary',
					function(err, data)
					{
						if(err) 
							__respond(resp,500,String(err));
						else
							__respond(resp,200,'',data,{'Content-Type': 'image/png'});
					});



			/* provide an interface to the unfortunately unavoidable dataurize 
				module which returns data URIs for resources at arbitrary URLs */
			else if( req.method == 'GET' && url.pathname == '/datauri' )
			{
				var target = _url.parse(decodeURI(url['query']['target']));
				_duri.dataurize(
					target,
					function(err,datauri)
					{
						if(err) 
							__respond(resp,500,_utils.jsons(err));
						else
							__respond(resp,200,'',datauri);
					});
			}



			/* serve metamodels, buttons models and their icons */
			else if( req.method == 'GET' && 
				 (url.pathname.match(/\.metamodel$/) ||
				  url.pathname.match(/\.buttons.model$/) ||
				  url.pathname.match(/\.icon\.png$/i)) )
			{
				var isIcon = url.pathname.match(/\.icon\.png$/i);
				_fs.readFile('./users/'+url.pathname, (isIcon ? 'binary' : 'utf8'), 
					function(err, data)
					{
						if(err) 
							__respond(resp,500,String(err));
						else
						{
							var contentType = 
									(isIcon ? 
										{'Content-Type': 'image/png'} : 
										{'Content-Type': 'application/json'});
							__respond(resp,200,'',data,contentType);
						}
					});
	  		}



			/* serve ordinary files (e.g., js includes, images, css) 

				NOTE:: distinguish between atompm images (e.g., grid background,
						 filebrowser icons) and CS/Images */
			else if( req.method == 'GET' && 
					   (url.pathname.match(/\.html$/)  || 
						 url.pathname.match(/\.css$/)   || 
	  					 url.pathname.match(/\.js$/)	  ||
	  					 url.pathname.match(/\.pdf$/)   ||
					 	 url.pathname.match(/\.png$/i)  ||
						 url.pathname.match(/\.jpg$/i)  ||
						 url.pathname.match(/\.jpeg$/i) ||
						 url.pathname.match(/\.gif$/i)  ||
						 url.pathname.match(/\.svg$/i)) )
			{
				var isImage = url.pathname.match(/\.png$/i) ||
								  url.pathname.match(/\.jpg$/i) ||
								  url.pathname.match(/\.jpeg$/i) ||
		 						  url.pathname.match(/\.gif$/i) ||
		 						  url.pathname.match(/\.svg$/i),
					isText 	= ! isImage && ! url.pathname.match(/\.pdf$/);

				if( isImage && ! url.pathname.match(/^\/client\/media\//) )
					url.pathname = '/users/'+url.pathname;

				_fs.readFile('.'+url.pathname, (isText ? 'utf8' : 'binary'),
					function(err, data)
					{
						if(err) 
							__respond(resp,500,String(err));
						else
						{
							var contentType = 
								(url.pathname.match(/\.html$/) ? 
									 {'Content-Type': 'text/html'} :
								 url.pathname.match(/\.css$/) ? 
									 {'Content-Type': 'text/css'} :
								 url.pathname.match(/\.js$/) ? 
									 {'Content-Type': 'application/javascript'} :
								 url.pathname.match(/\.pdf$/) ? 
									 {'Content-Type': 'application/pdf'} :
								 url.pathname.match(/\.png$/i) ? 
									 {'Content-Type': 'image/png'} :
								 url.pathname.match(/\.jpg$/i) || 
								 	url.pathname.match(/\.jpeg$/i) ? 
									 {'Content-Type': 'image/jpeg'} :
								 url.pathname.match(/\.gif$/i) ? 
									 {'Content-Type': 'image/gif'} :
								 url.pathname.match(/\.svg$/i) ? 
									 {'Content-Type': 'image/svg+xml'} :
								 undefined);
							__respond(resp,200,'',data,contentType);
						}
					});
	  		}



			/* serve encrypted user password */
			else if( req.method == 'GET' && url.pathname == '/passwd' )
				_fs.readFile('./users/'+url['query']['username']+'/passwd', 'utf8',
					function(err, data)
					{
						if(err) 
							__respond(resp,500,String(err));
						else
							__respond(resp,200,'',data,{'Content-Type': 'text/html'});
					});


			/* create new user 
			 	1. make sure user doesn't already exist
			 	2. make a new copy of ./users/(default) 
			 	3. create password file */
			else if( req.method == 'POST' && url.pathname == '/user' )
			{
				var userdir = './users/'+url['query']['username'];
				_fs.exists(userdir,
					function(exists)
					{
						if( exists )
						{
							__respond(resp,500,'username already exists');
							return;
						}

						_fspp.cp('./users/(default)/',userdir,
							function(err, stdout, stderr)
							{
								if( err )
								{
									__respond(resp,500,String(err));
									return;
								}
									
								_fs.writeFile(
									userdir+'/passwd',
									url['query']['password'],
									function(err)
									{
										if( err )
											__respond(resp,500,String(err));
										else
											__respond(resp,200);
									});			
							});
					});
			}



			/* serve [a subset of] user preferences */
			else if( req.method == 'GET' && url.pathname.match(/prefs$/) )
				_fs.readFile('./users/'+url.pathname, 'utf8',
					function(err, data)
					{
						if(err) 
							__respond(resp,500,String(err));
						else if( url['query']['subset'] == undefined )
							__respond(resp,200,'',data);
						else
							try 			
							{	
								__respond(
									resp,
									200,
									'',
									_utils.splitDict(
										_utils.jsonp(data),
										_utils.jsonp(url['query']['subset'])));
							}
							catch(err)	{__respond(resp,500,String(err));}
					});


			/* update user preferences

				1 retrieve all post data
				2 read prefs file from disk
				3 apply changes 
			 	4 write updated prefs to disk */
			else if( req.method == 'PUT' && url.pathname.match(/prefs$/) )
			{
				var reqData = '';
				req.addListener("data", function(chunk) {reqData += chunk;});
				req.addListener("end", 
					function() 
					{
						_fs.readFile('./users/'+url.pathname, 'utf8',
							function(err, prefs)
							{
								if(err) 
									__respond(resp,500,String(err));
								else
								{
									try 			
									{	
										prefs   = _utils.jsonp(prefs);
										reqData = _utils.jsonp(reqData);
									}
									catch(err)	
									{
										__respond(resp,500,String(err));
										return;
									}

									for( var pref in reqData )
										prefs[pref]['value'] = reqData[pref];

									_fs.writeFile(
										'./users/'+url.pathname, 
										_utils.jsons(prefs,null,'\t'),
										function(err, data)
										{
											if(err) 
												__respond(resp,500,String(err));
											else
												__respond(resp,200);
										});
								}	
							});
					});
			}



			/*	delete specified file/folder */	
			else if( req.method == 'DELETE' && url.pathname.match(/\.(file|folder)$/) )
			{
                if (url.pathname.match('_Trash_')) {
                    __respond(resp,500,"cannot remove trash!");
                } else {
                    var matches  = url.pathname.match(/^\/(.*?)\/(.*\/)?(.*)\.(file|folder)$/),
                         username = matches[1],
                         folder = matches[2] || '',
                         fname 	 = matches[3],
                         userdir	 = './users/'+username+'/',
                         ondelete = 
                             function(err, stdout, stderr)
                             {
                                 if( err )
                                     __respond(resp,500,String(err));
                                 else
                                     __respond(resp,200);
                             },
                         deletef  = 
                             function(response)
                             {
                                 var newname = userdir+'_Trash_/'+folder+fname;
                                 if (_fs.existsSync(newname)) {
                                     if (url.pathname.match(/\.folder$/)) {
                                         _fspp.deleteFolderRecursive(newname);
                                     } else {
                                         _fs.unlink(newname);
                                     }
                                 }
                                 _fspp.mv(userdir+folder+fname,userdir+'_Trash_/'+folder,ondelete);
                             };
                    _fs.exists(userdir+'_Trash_/'+folder,
                        function(exists)
                        {
                            if( ! exists )
                                _fspp.mkdirs(userdir+'_Trash_/'+folder,deletef);
                            else {
                                deletef();
                            }
                        });
                }
			}



			/*	create folder */	
			else if( req.method == 'POST' && url.pathname.match(/\.folder$/) )
			{
				var matches  = url.pathname.match(/^\/(.*?)\/(.*)\.folder$/),
					 username = matches[1],
                     folder = matches[2],
					 userdir	 = './users/'+username+'/',
					 oncreate = 
						 function(err, stdout, stderr)
						 {
							 if( err )
								 __respond(resp,500,String(err));
							 else
								 __respond(resp,200);
						 };
				_fs.exists(userdir+folder,
					function(exists)
					{
						if( ! exists )
							_fspp.mkdirs(userdir+folder,oncreate);
                        else {
                            oncreate("folder " + folder + " already exists");
                        }
					});
			}



			/*	rename file/folder (or move) */	
			else if( req.method == 'PUT' && url.pathname.match(/\.(folder|file)$/) )
			{                
                req.setEncoding('utf8');
				var data = '';
				req.addListener("data", function(chunk) {data += chunk;});
				req.addListener("end", 
                    function() {
                        data = _utils.jsonp(data);
                        if (data.match(/^\//)) {
                            // move
                            var matches  = url.pathname.match(/^\/(.*?)\/(.*\/)?(.*)\.(file|folder)$/),
                                username = matches[1],
                                folder = matches[2] || '',
                                fname 	 = matches[3],
                                userdir	 = './users/'+username,
                                onmove = 
                                     function(err, stdout, stderr)
                                     {
                                         if( err )
                                             __respond(resp,500,String(err));
                                         else
                                             __respond(resp,200);
                                     };
                                if (_fs.existsSync(userdir+data+fname)) {
                                    if (url.pathname.match(/\.folder$/)) {
                                         _fspp.deleteFolderRecursive(userdir+data+fname);
                                     } else {
                                         _fs.unlink(newname);
                                     }
                                }
                            _fspp.mv(userdir+"/"+folder+fname,userdir+data,onmove);
                        } else {
                            // rename
                            var matches  = url.pathname.match(/^\/(.*?)\/(.*\/)?(.*)\.(file|folder)$/),
                                username = matches[1],
                                folder = matches[2] || '',
                                fname 	 = matches[3],
                                userdir	 = './users/'+username+'/',
                                onrename = 
                                     function(err, stdout, stderr)
                                     {
                                         if( err )
                                             __respond(resp,500,String(err));
                                         else
                                             __respond(resp,200);
                                     };
                            _fs.rename(userdir+folder+fname,userdir+folder+data,onrename);
                        }
                    }
                );
				
			}
            
            else if (req.method == 'POST' && url.pathname.match(/\.formalism$/)) {
                // create new formalism
                var matches = url.pathname.match(/^(.*)\/(.*)\.formalism$/),
                    username = matches[1],
                    formalism = matches[2],
                    userdir	 = './users/'+username+"/",
                    oncreatefolder = 
                         function(err, stdout, stderr)
                         {
                             if( err )
                                 __respond(resp,500,String(err));
                             else {
                                 _fs.createReadStream(userdir+"Formalisms/__Templates__/MetamodelTemplate.model").pipe(_fs.createWriteStream(userdir+"Formalisms/"+formalism+"/"+formalism+".model"));
                                 _fs.createReadStream(userdir+"Formalisms/__Templates__/ConcreteSyntaxTemplate.model").pipe(_fs.createWriteStream(userdir+"Formalisms/"+formalism+"/"+formalism+".defaultIcons.model"));
                                 _fs.createReadStream(userdir+"Formalisms/__Templates__/MetamodelTemplate.metamodel").pipe(_fs.createWriteStream(userdir+"Formalisms/"+formalism+"/"+formalism+".metamodel"));
                                 _fs.createReadStream(userdir+"Formalisms/__Templates__/ConcreteSyntaxTemplate.defaultIcons.metamodel").pipe(_fs.createWriteStream(userdir+"Formalisms/"+formalism+"/"+formalism+".defaultIcons.metamodel"));
                                 _fs.createReadStream(userdir+"Formalisms/__Templates__/T_TransformationTemplate.model").pipe(_fs.createWriteStream(userdir+"Formalisms/"+formalism+"/OperationalSemantics/T_OperationalSemantics.model"));
                                 _fs.createReadStream(userdir+"Formalisms/__Templates__/T_TransformationTemplate.model").pipe(_fs.createWriteStream(userdir+"Formalisms/"+formalism+"/TranslationalSemantics/T_TranslationalSemantics.model"));
                                 __respond(resp,200);
                             }
                         };
                _fs.mkdir(userdir+"Formalisms/"+formalism,function(err, stdout, stderr) {            
                     if( err )
                         __respond(resp,500,String(err));
                     else {
                         _fs.mkdirSync(userdir+"Formalisms/"+formalism+"/OperationalSemantics");
                         _fs.mkdir(userdir+"Formalisms/"+formalism+"/TranslationalSemantics", oncreatefolder);
                     }
                });
            }
            
            else if (req.method == 'POST' && url.pathname.match(/\.transformation$/)) {
                // create new transformation
                var matches = url.pathname.match(/^\/(.*?)\/(.*)\.transformation$/),
                    username = matches[1],
                    userdir	 = './users/'+username+"/";
                    
                _fs.createReadStream(userdir+"Formalisms/__Templates__/T_TransformationTemplate.model").pipe(_fs.createWriteStream('./users/'+url.pathname.slice(0, -(".transformation".length))));
                __respond(resp,200);
            }
            
            else if (req.method == 'POST' && url.pathname.match(/\.rule$/)) {
                // create new rule
                var matches = url.pathname.match(/^\/(.*?)\/(.*)\.rule$/),
                    username = matches[1],
                    userdir	 = './users/'+username+"/";
                    
                _fs.createReadStream(userdir+"Formalisms/__Templates__/R_RuleTemplate.model").pipe(_fs.createWriteStream('./users/'+url.pathname.slice(0, -(".rule".length))));
                __respond(resp,200);
            }
				
			/* extract user-uploaded archive to specified folder 
				1. read in all data
				2. make sure destination exists and is a directory
				3. write data to temp file (upload###.zip)
				4. extract temp file and remove it
			 
				NOTE:: it's not clear why (despite hours of googling) but the 
						 "req.setEncoding('utf8')" statement makes the difference
						 between retrieving correct and corrupted (when non-text
						 files in zip) data */
			else if( req.method == 'PUT' && url.pathname.match(/\.file$/) )
			{
				req.setEncoding('utf8');

				let reqData = '',
					 tmpzip	= 'upload'+Date.now()+'.zip',
					 destdir	= './users/'+url.pathname.match(/(.*)\.file$/)[1]+'/';

				if( url.pathname.contains("..") || url.pathname.contains(";") ) {
					__respond(resp, 404,
						'invalid pathname, no semicolons or .. allowed :: ' + url.pathname);
					return;
				}

				req.addListener("data", function(chunk) {reqData += chunk;});
				req.addListener("end", 
					function() 
					{
						_fs.stat(destdir,
							function(err,stats)
							{
								if( err )
									__respond(resp,404,String(err));
								else if( ! stats.isDirectory() )
									__respond(resp,404,
										'destination is not a directory :: '+destdir);
								else
									_fs.writeFile(
										destdir+tmpzip,eval('('+reqData+')'),
										'binary',
										function(err)
										{
											_cp.exec('cd '+destdir+'; unzip -o '+tmpzip,
												function(err, stdout, stderr)
												{
													if( err )
														__respond(resp,500,String(err));
													else
														__respond(resp,200);
													_fs.unlink(destdir+tmpzip, function(err){
														console.log("Unlinked " + destdir + tmpzip);
														}
													);
												});
										});
							});
					});
			}

			/* serve specified file/folder within a zip file */ 
			else if( req.method == 'GET' && url.pathname.match(/\.file$/) )
			{
				let matches  = url.pathname.match(/^\/(.*?)\/(.*)\.file$/),
					 username = matches[1],
 					 fname 	 = './'+matches[2],
					 userdir	 = './users/'+username+'/',
					 tmpzip	 = 'download'+Date.now()+'.zip';

				if( username.contains("..") || username.contains(";") ) {
					__respond(resp, 404,
						'invalid username, no colons or .. allowed :: ' + username);
					return;
				}

				_fs.exists(userdir+fname,
					function(exists)
					{
						if( ! exists )
							__respond(resp,404,
								'requested file/folder does not exist :: '+fname);
						else 
							_cp.exec('cd '+userdir+'; zip -r '+tmpzip+' "'+fname+'"',
								function(err, stdout, stderr)
								{
									if( err )
										__respond(resp,500,String(err));
									else
										_fs.readFile(userdir+tmpzip,
											function(err, data)
											{
												__respond(resp,200,'',data,
													{'Content-Type':'application/zip',
													 'Content-Disposition':
													 	'attachment; filename="'+tmpzip+'"'});
												_fs.unlink(userdir+tmpzip, function(err){
													console.log("Unlinked " + userdir+tmpzip);
												});
											});
								});
					});
			}

			/*	serve list of all files */
			else if( req.method == 'GET' && 
						url.pathname.match(/^\/.+\/filelist$/) )
			{
				var matches = url.pathname.match(/^\/(.+)\/filelist$/);
				_fspp.findfiles('./users/'+matches[1], 
						function(err, stdout, stderr)
						{
							if( err )
								__respond(resp,404,String(err));
							else
								__respond(resp,200,'',stdout);
						});
			}

			else{
				session_manager.handle_http_message(url, req, resp);
			}


		});

session_manager.init_session_manager(httpserver);

function startServer() {
  httpserver.listen(port);
  logger.info(`Server listening on: http://localhost:${port}/atompm`);
  logger.info("```mermaid");
  logger.info("sequenceDiagram");

  function gracefulShutdown() {
    logger.info("Gracefully shutting down...");
    httpserver.close();
  }
  process.once('SIGINT', () => {
    // The Python process belongs to the same process group, and will also receive a SIGINT.
    // This is not necessary, because we send a SIGTERM to the Python process anyway, but it won't cause us trouble.

    // The next SIGINT will cause a forced exit:
    process.once('SIGINT', () => {
      process.exit(1);
    });
    logger.info("");
    logger.info("Received SIGINT. Send another SIGINT to force shutdown.");
    gracefulShutdown();
  });
  process.once('SIGTERM', gracefulShutdown);
}

// Run Python transformation engine as a child process:
if (runWithPythonChildProcess) {
  const pythonProcess = _cp.spawn('python', ['mt/main.py']);
  pythonProcess.on('exit', (code, signal) => {
    logger.info("Model Transformation Server exited "
      + ((code===null) ? ("by signal " + signal) : ("with code " + code.toString())));
  });
  const coloredStream = (readableStream, writableStream, colorCode) => {
    readableStream.on('data', chunk => {
      writableStream.write("\x1b["+colorCode+"m"); // set color
      writableStream.write(chunk);
      writableStream.write("\x1b[0m"); // reset color
    });
  };
  // output of Python process is interleaved with output of this process:
  coloredStream(pythonProcess.stdout, process.stdout, "33"); // yellow
  coloredStream(pythonProcess.stderr, process.stderr, "91"); // red

  // Only start the HTTP server after the Transformation Server has started.
  // When the Python process has written the following string to stdout, we know the transformation server has started:
  const expectedString = Buffer.from("Started Model Transformation Server\n");
  let accumulatedOutput = Buffer.alloc(0);
  function pythonStartedListener(chunk) {
    accumulatedOutput = Buffer.concat([accumulatedOutput, chunk]);

    if (accumulatedOutput.length >= expectedString.length) {
      if (accumulatedOutput.subarray(0, expectedString.length).equals(expectedString)) {
        // No need to keep accumulating pythonProcess' stdout:
        pythonProcess.stdout.removeListener('data', pythonStartedListener);

        httpserver.on('close', () => {
          pythonProcess.kill('SIGTERM'); // cleanly exit Python process AFTER http server has shut down.
        });

        startServer();
      }
    }
  }
  const waitUntilExpectedString = pythonProcess.stdout.on('data', pythonStartedListener);

  // In case of a forced exit (e.g. uncaught exception), the Python process may still be running, so we force-kill it:
  process.on('exit', code => {
    pythonProcess.kill('SIGKILL');
  });
}
else {
  // Run without Python as a child process
  startServer();
}

