'use strict'
const bcrypt = require( 'bcrypt' )
const crs = require( 'crypto-random-string' )
const appRoot = require( 'app-root-path' )
const knex = require( `${appRoot}/db/knex` )

const Branches = ( ) => knex( 'branches' )
const Commits = ( ) => knex( 'commits' )
const StreamCommits = ( ) => knex( 'stream_commits' )
const BranchCommits = ( ) => knex( 'branch_commits' )
const ParentCommits = ( ) => knex( 'parent_commits' )

const { getBranchesByStreamId } = require( './branches' )

module.exports = {

  async createCommitByBranchId( { streamId, branchId, objectId, authorId, message, previousCommitIds } ) {

    // Create main table entry
    let [ id ] = await Commits( ).returning( 'id' ).insert( {
      id: crs( { length: 10 } ),
      referencedObject: objectId,
      author: authorId,
      message: message
    } )

    // Link it to a branch
    await BranchCommits( ).insert( {
      branchId: branchId,
      commitId: id
    } )

    // Link it to a stream
    await StreamCommits( ).insert( {
      streamId: streamId,
      commitId: id
    } )

    // Link it to its children, if any.
    if ( Array.isArray( previousCommitIds ) && previousCommitIds.length > 0 ) {
      let childrenMap = previousCommitIds.map( childId => { return { parent: id, child: childId } } )
      await ParentCommits( ).insert( childrenMap )
    }

    return id
  },

  async createCommitByBranchName( { streamId, branchName, objectId, authorId, message, previousCommitIds } ) {
    let branches = await getBranchesByStreamId( { streamId: streamId } )
    let myBranch = branches.find( b => b.name === branchName )

    if ( !myBranch )
      throw new Error( `Failed to find bracnh with name ${branchName}.` )

    return await module.exports.createCommitByBranchId( { streamId, branchId: myBranch.id, objectId, authorId, message, previousCommitIds } )
  },

  async updateCommit( { id, message } ) {
    return await Commits( ).where( { id: id } ).update( { message: message } )
  },

  async getCommitById( { id } ) {
    return await Commits( ).where( { id: id } ).first( )
  },

  async deleteCommit( { id } ) {
    return await Commits( ).where( { id: id } ).del( )
  },

  async getCommitsTotalCountByBranchId( { branchId } ) {
    let [ res ] = await BranchCommits( ).count( ).where( 'branchId', branchId )

    return parseInt( res.count )
  },

  async getCommitsTotalCountByBranchName( { streamId, branchName } ) {
    let branches = await getBranchesByStreamId( { streamId: streamId } )
    let myBranch = branches.find( b => b.name === branchName )

    if ( !myBranch )
      throw new Error( `Failed to find branch with name ${branchName}.` )

    return module.exports.getCommitsTotalCountByBranchId( { branchId: myBranch.id } )
  },

  async getCommitsByBranchId( { branchId, limit, cursor } ) {
    limit = limit || 20
    let query = BranchCommits( ).columns( [ 'commitId', 'message', 'referencedObject', { author: 'name' }, { authorId: 'users.id' }, 'commits.createdAt' ] ).select( )
      .join( 'commits', 'commits.id', 'branch_commits.commitId' )
      .join( 'users', 'commits.author', 'users.id' )
      .where( 'branchId', branchId )


    if ( cursor )
      query.andWhere( 'commits.createdAt', '<', cursor )

    query.orderBy( 'commits.createdAt', 'desc' ).limit( limit )

    let rows = await query

    return { commits: rows, cursor: rows.length > 0 ? rows[ rows.length - 1 ].createdAt : null }
  },

  async getCommitsByBranchName( { streamId, branchName, limit, cursor } ) {
    let branches = await getBranchesByStreamId( { streamId: streamId } )
    let myBranch = branches.find( b => b.name === branchName )

    if ( !myBranch )
      throw new Error( `Failed to find branch with name ${branchName}.` )

    return module.exports.getCommitsByBranchId( { branchId: myBranch.id, limit, cursor } )
  },

  async getCommitsTotalCountByStreamId( { streamId } ) {
    let [ res ] = await StreamCommits( ).count( ).where( 'streamId', streamId )
    return parseInt( res.count )
  },

  async getCommitsByStreamId( { streamId, limit, cursor } ) {
    limit = limit || 20
    let query = StreamCommits( ).columns( [ 'commitId', 'message', 'referencedObject', { author: 'name' }, { authorId: 'users.id' }, 'commits.createdAt' ] ).select( )
      .join( 'commits', 'commits.id', 'stream_commits.commitId' )
      .join( 'users', 'commits.author', 'users.id' )
      .where( 'streamId', streamId )


    if ( cursor )
      query.andWhere( 'commits.createdAt', '<', cursor )

    query.orderBy( 'commits.createdAt', 'desc' ).limit( limit )

    let rows = await query
    return { commits: rows, cursor: rows.length > 0 ? rows[ rows.length - 1 ].createdAt : null }
  },

  async getCommitsByUserId( { userId, limit, cursor, publicOnly } ) {
    limit = limit || 20
    publicOnly = publicOnly !== false

    let query =
      Commits( )
      .columns( [ 'commitId', 'message', 'referencedObject', 'commits.createdAt', { streamId: 'stream_commits.streamId' }, { streamName: 'streams.name' } ] ).select( )
      .join( 'stream_commits', 'commits.id', 'stream_commits.commitId' )
      .join( 'streams', 'stream_commits.streamId', 'streams.id' )
      .where( 'author', userId )

    if ( publicOnly )
      query.andWhere( 'streams.isPublic', true )

    if ( cursor )
      query.andWhere( 'commits.createdAt', '<', cursor )

    query.orderBy( 'commits.createdAt', 'desc' ).limit( limit )

    let rows = await query
    return { commits: rows, cursor: rows.length > 0 ? rows[ rows.length - 1 ].createdAt : null }
  },

  async getCommitsTotalCountByUserId( { userId } ) {
    let [ res ] = await Commits( ).count( ).where( 'author', userId )
    return parseInt( res.count )
  }
}